from datetime import date


def _this_week():
    today = date.today()
    monday = today.fromordinal(today.toordinal() - today.weekday())
    sunday = monday.fromordinal(monday.toordinal() + 6)
    return monday, sunday


def test_only_admin_runs_weekly_reminder(user_a_client):
    assert user_a_client.post("/admin/reminders/weekly-birthdays").status_code == 403


def test_weekly_reminder_no_birthdays_creates_nothing(super_admin_client, user_a_client):
    r = super_admin_client.post("/admin/reminders/weekly-birthdays")
    assert r.status_code == 200
    assert r.json()["notifications_created"] == 0
    assert user_a_client.get("/notifications").json() == []


def test_weekly_reminder_notifies_everyone(super_admin_client, user_a_client, user_b_client):
    monday, _ = _this_week()
    # dá a user_a um aniversário nesta semana (segunda)
    user_a_client.patch(
        "/auth/me",
        json={"birth_set": True, "birth_day": monday.day, "birth_month": monday.month, "full_name": "Aniversariante"},
    )

    r = super_admin_client.post("/admin/reminders/weekly-birthdays")
    assert r.status_code == 200
    assert r.json()["notifications_created"] >= 3  # admin + user_a + user_b

    for client in (super_admin_client, user_a_client, user_b_client):
        rows = client.get("/notifications").json()
        assert any(n["kind"] == "birthday_week" and "Aniversariante" in n["text"] for n in rows)


def test_weekly_reminder_is_idempotent_without_force(db_engine, super_admin_user, user_a):
    """Duas passadas do agendador (force=False) na mesma semana só mandam
    uma vez — o endpoint usa force=True, este caminho é o do cron."""
    from sqlmodel import Session

    from app.db.models import User
    from app.services.reminders import send_weekly_birthday_reminder

    monday, _ = _this_week()
    with Session(db_engine) as s:
        u = s.get(User, user_a.id)
        u.birth_day, u.birth_month = monday.day, monday.month
        s.add(u)
        s.commit()
        first = send_weekly_birthday_reminder(force=False, session=s)
        second = send_weekly_birthday_reminder(force=False, session=s)
    assert first > 0
    assert second == 0
