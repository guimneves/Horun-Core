"""Avisos da Agenda (sininho + e-mail), pedido do usuário em 05/10/2026:

- **Reuniões/eventos de um grupo**: todos os membros do grupo (e o admin
  interno) são avisados quando o evento é marcado, alterado ou cancelado, e
  recebem um lembrete na véspera (até 24 h antes).
- **Reservas de equipamento**: quem reservou recebe a confirmação por
  e-mail, um lembrete 1 h antes, e um aviso se outra pessoa (moderador)
  cancelar a reserva.
- **Retificação** (pedido de 06/10/2026): mudou o horário (ou o
  equipamento, ou o local da reunião) → mensagem "Retificação" com o antes
  e o depois — para quem reservou (mesmo que tenha sido a própria pessoa: o
  e-mail serve de comprovante, como a confirmação) e para os membros do grupo.

Quem fez a ação não é avisado da própria ação no sininho. E-mail sempre
respeita o opt-out da pessoa (`User.email_notifications`, ver core/email.py).
Os lembretes rodam pelo agendador (core/scheduler.py, a cada 15 min) e
marcam `reminder_sent_at` para não repetir; reagendar zera a marca.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.core.email import notify_user_by_email
from app.core.groups import group_member_ids
from app.db.models import Equipment, Event, Group, Notification, Reservation, User

LAB_TZ = ZoneInfo("America/Sao_Paulo")  # horários da Agenda são locais (sem fuso)
EVENT_REMINDER = timedelta(hours=24)
RESERVATION_REMINDER = timedelta(hours=1)
FOOTER = "\n\n— Horun (para não receber e-mails, desligue em Meu perfil)."


def lab_now() -> datetime:
    return datetime.now(LAB_TZ).replace(tzinfo=None)


def _when(start: datetime, end: datetime, all_day: bool = False) -> str:
    if all_day:
        day = start.strftime("%d/%m/%Y")
        last = end.strftime("%d/%m/%Y")
        return day if day == last else f"{day} a {last}"
    if start.date() == end.date():
        return f"{start:%d/%m/%Y}, {start:%H:%M}–{end:%H:%M}"
    return f"{start:%d/%m/%Y %H:%M} a {end:%d/%m/%Y %H:%M}"


def _send(
    session: Session,
    users: list[User],
    *,
    kind: str,
    text: str,
    subject: str,
    body: str,
    link: str = "/agenda",
    actor_id: int | None = None,
    bell: bool = True,
) -> int:
    for user in users:
        if bell:
            session.add(Notification(user_id=user.id, kind=kind, text=text, link=link, actor_id=actor_id))
        notify_user_by_email(user, subject, body + FOOTER)
    return len(users)


# ---------------------------------------------------------------- grupos


def _group_audience(session: Session, event: Event, exclude_id: int | None) -> tuple[Group | None, list[User]]:
    group = session.get(Group, event.group_id) if event.group_id is not None else None
    if group is None:
        return None, []
    ids = group_member_ids(session, group.id) | {group.internal_admin_id}
    ids.discard(exclude_id)
    users = [u for u in (session.get(User, i) for i in sorted(ids)) if u is not None]
    return group, users


def notify_group_event(
    session: Session, event: Event, change: str, actor: User | None, *, before: tuple | None = None
) -> int:
    """`change`: "nova" | "alterada" | "cancelada". Só eventos de grupo.
    `before` (em "alterada"): (início, fim, dia inteiro, local) antes da
    mudança — se o horário ou o local mudou, a mensagem é uma RETIFICAÇÃO
    com o antes e o depois."""
    group, users = _group_audience(session, event, actor.id if actor else None)
    if group is None or not users:
        return 0
    when = _when(event.start_at, event.end_at, event.all_day)
    previous = None
    if change == "alterada" and before is not None:
        old_start, old_end, old_all_day, old_location = before
        moved = (old_start, old_end, old_all_day) != (event.start_at, event.end_at, event.all_day)
        if moved or old_location != event.location:
            previous = (_when(old_start, old_end, old_all_day) if moved else None, old_location if old_location != event.location else None)
    label = {"nova": "Novo evento", "alterada": "Evento alterado", "cancelada": "Evento cancelado"}[change]
    if previous is not None:
        label = "Retificação"
    text = f"{label} do grupo {group.name}: {event.title} — {when}"
    lines = [f"{label} do grupo {group.name}.", "", f"{event.title}", f"Quando: {when}"]
    if previous is not None and previous[0]:
        text += f" (antes: {previous[0]})"
        lines.append(f"Antes: {previous[0]}")
    if event.location:
        lines.append(f"Onde: {event.location}")
    if previous is not None and previous[1] is not None:
        lines.append(f"Local anterior: {previous[1] or '(sem local)'}")
    if event.description and change != "cancelada":
        lines += ["", event.description]
    return _send(
        session, users, kind="group_event", text=text, actor_id=actor.id if actor else None,
        subject=f"Horun · {group.name}: {event.title} ({label.lower()})", body="\n".join(lines),
    )


# ---------------------------------------------------------------- reservas


def _equipment_name(session: Session, equipment_id: str) -> str:
    eq = session.get(Equipment, equipment_id)
    return (eq.display_name or eq.id) if eq else equipment_id


def notify_reservation(
    session: Session, reservation: Reservation, change: str, actor: User | None, *, before: tuple | None = None
) -> int:
    """`change`: "confirmada" (só e-mail, para quem reservou) | "retificada"
    (horário ou equipamento mudou — `before` = (equipamento, início, fim)
    antigos; sempre avisa quem reservou: por e-mail se foi a própria pessoa,
    sininho + e-mail se foi outra) | "cancelada" (avisa quem reservou quando
    OUTRA pessoa cancelou)."""
    owner = session.get(User, reservation.user_id)
    if owner is None:
        return 0
    by_other = actor is not None and actor.id != owner.id
    if change == "cancelada" and not by_other:
        return 0
    name = _equipment_name(session, reservation.equipment_id)
    when = _when(reservation.start_at, reservation.end_at)
    who = f" por {actor.display_name or actor.username}" if by_other else ""
    title = f" ({reservation.title})" if reservation.title else ""
    label = {"confirmada": "Reserva confirmada", "retificada": "Retificação de reserva", "cancelada": "Reserva cancelada"}[change]
    text = f"{label}{who}: {name}{title} — {when}"
    body = f"{label}{who}.\n\nEquipamento: {name}{title}\nQuando: {when}"
    if change == "retificada" and before is not None:
        old_equipment, old_start, old_end = before
        old_name = _equipment_name(session, old_equipment)
        old_when = _when(old_start, old_end)
        antes = f"{old_name}, {old_when}" if old_equipment != reservation.equipment_id else old_when
        text += f" (antes: {antes})"
        body += f"\nAntes: {antes}"
    return _send(
        session, [owner], kind="reservation", bell=change != "confirmada" and by_other,
        actor_id=actor.id if actor else None, text=text,
        subject=f"Horun · {label}: {name}, {when}", body=body,
    )


# ---------------------------------------------------------------- lembretes


def send_due_reminders(session: Session, now: datetime | None = None) -> dict[str, int]:
    """Lembretes de eventos de grupo (até 24 h antes) e de reservas (até
    1 h antes) que ainda não foram lembrados. Idempotente."""
    now = now or lab_now()
    sent = {"events": 0, "reservations": 0}

    for event in session.exec(
        select(Event).where(
            Event.group_id.is_not(None),  # type: ignore[union-attr]
            Event.reminder_sent_at.is_(None),  # type: ignore[union-attr]
            Event.start_at > now,
            Event.start_at <= now + EVENT_REMINDER,
        )
    ).all():
        group, users = _group_audience(session, event, None)
        if group is not None and users:
            when = _when(event.start_at, event.end_at, event.all_day)
            body = f"Lembrete: {event.title} (grupo {group.name})\nQuando: {when}"
            if event.location:
                body += f"\nOnde: {event.location}"
            _send(session, users, kind="group_event", text=f"Lembrete — {group.name}: {event.title}, {when}",
                  subject=f"Horun · Lembrete: {event.title} ({when})", body=body)
            sent["events"] += 1
        event.reminder_sent_at = now
        session.add(event)

    for reservation in session.exec(
        select(Reservation).where(
            Reservation.reminder_sent_at.is_(None),  # type: ignore[union-attr]
            Reservation.start_at > now,
            Reservation.start_at <= now + RESERVATION_REMINDER,
        )
    ).all():
        owner = session.get(User, reservation.user_id)
        if owner is not None:
            name = _equipment_name(session, reservation.equipment_id)
            when = _when(reservation.start_at, reservation.end_at)
            _send(session, [owner], kind="reservation", text=f"Lembrete: sua reserva do {name} começa às {reservation.start_at:%H:%M}",
                  subject=f"Horun · Lembrete: reserva do {name} às {reservation.start_at:%H:%M}",
                  body=f"Sua reserva começa em breve.\n\nEquipamento: {name}\nQuando: {when}")
            sent["reservations"] += 1
        reservation.reminder_sent_at = now
        session.add(reservation)

    session.commit()
    return sent
