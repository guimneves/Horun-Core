"""Modelos de banco de dados do Horun Core (ver Prompt_Horun_Core.md).

- **User**: conta de plataforma. `is_super_admin` é o "administrador
  máximo" da seção 6 do Prompt_Horun_Core.md — diferente do papel `admin`
  que cada módulo tem internamente (ex. RE7S). `is_protected` segue o
  mesmo padrão do RE7S: a conta de bootstrap nunca pode ser excluída,
  rebaixada nem ter usuário/senha alterados, para sempre haver um acesso
  de backup garantido. Importação de usuários do AD (seção 4) ainda não
  implementada — hoje todo usuário é criado localmente pelo super-admin.
- **Module**: cadastro de um módulo (RE7S, Leco, ...) — `id` é o slug
  usado tanto no `MODULE.md` do módulo quanto na rota de proxy
  (`/m/{id}/...`). `internal_base_url` só precisa ser alcançável dentro da
  rede Docker do servidor, nunca da rede do laboratório diretamente
  (seção 3 do Prompt_Horun_Core.md).
- **UserModuleAccess**: permissão binária usuário↔módulo (seção 6) — o
  Core só decide *se* a pessoa entra; o que ela pode fazer lá dentro é
  responsabilidade do próprio módulo.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Listas fechadas — pedido do usuário. Guardadas como texto simples (não
# como Enum de banco) de propósito: SQLAlchemy/SQLModel tem pegadinhas de
# migração com Enum nativo (ver nota em routes_auth.py), e como a validação
# já acontece na API (Pydantic/Literal), uma coluna de texto simples evita
# esse problema inteiro sem perder nada.
POSITIONS = ["Pesquisador(a)", "Coordenador(a)", "Técnico(a)", "Iniciação Científica"]
QUALIFICATIONS = [
    "Professor(a)",
    "Doutor(a)",
    "Doutorando(a)",
    "Mestre(a)",
    "Mestrando(a)",
    "Graduado(a)",
    "Graduando(a)",
    "Técnico(a)",
]


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    # Opcional agora — ver seção "Criação sem senha" em routes_auth.py:
    # uma conta pode nascer sem senha, com um código de primeiro acesso em
    # `setup_code`, até a própria pessoa definir a senha dela.
    password_hash: Optional[str] = None
    setup_code: Optional[str] = None
    display_name: str = ""
    full_name: str = ""
    email: str = ""
    phone: str = ""
    # Um dos valores de POSITIONS/QUALIFICATIONS acima, ou "" (não
    # definido) — atribuído pelo administrador máximo, não autoatendido.
    position: str = ""
    qualification: str = ""
    # Data de nascimento em partes — dia e mês andam juntos (ou os dois
    # nulos), ano é opcional (privacidade). O calendário só usa dia+mês;
    # guardar separado evita o vaivém de `date` nullable com info parcial.
    birth_day: Optional[int] = None
    birth_month: Optional[int] = None
    birth_year: Optional[int] = None
    # Recebe as notificações importantes (menção, resposta, digest
    # semanal) também por e-mail. Precisa de `email` preenchido e do SMTP
    # configurado no servidor.
    email_notifications: bool = Field(default=True)
    # Foto de perfil — guardada no próprio banco (bytes), não em disco:
    # time pequeno, evita depender de um volume/servidor de arquivos
    # separado. Nunca incluída nas respostas normais de usuário (ver
    # UserOut em routes_auth.py) — só servida por GET /users/{id}/photo,
    # pra não pesar toda lista/login com o conteúdo da imagem.
    photo: Optional[bytes] = None
    photo_content_type: Optional[str] = None
    is_super_admin: bool = Field(default=False)
    # Conta de bootstrap protegida — mesmo raciocínio do RE7S (ver
    # app/api/routes_auth.py): sempre precisa existir um acesso de backup.
    is_protected: bool = Field(default=False)
    # False = ainda não passou pelo "complete seu perfil" do primeiro
    # acesso. A migração marca as contas já existentes como True (não
    # incomodar quem já usa); contas novas nascem False.
    onboarded: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class Module(SQLModel, table=True):
    # Id é o slug (ex. "re7s"), não um inteiro auto-incrementado — é ele
    # que aparece na URL do proxy (/m/re7s/...) e no MODULE.md do módulo.
    id: str = Field(primary_key=True)
    display_name: str
    description: str = ""
    icon: str = "🧪"
    internal_base_url: str  # ex. "http://re7s-backend:8000" — só resolve na rede Docker do servidor
    health_path: str = "/health"
    # Container que serve a SPA (estáticos) do módulo, ex.
    # "http://amostras-frontend:80" — vazio se o módulo ainda não suporta
    # o encaixe de interface dentro do Core (Prompt_Horun_Core.md, seção 8).
    internal_frontend_url: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class UserModuleAccess(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    module_id: str = Field(foreign_key="module.id", index=True)
    granted_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    granted_at: datetime = Field(default_factory=utcnow)


class Group(SQLModel, table=True):
    """Grupo de colaboradores (Fase 2). Cada grupo tem um mural e eventos
    de calendário próprios, visíveis só pros membros. O `internal_admin`
    é o dono designado — responsável por moderar o mural do grupo e
    criar os eventos dele; **obrigatoriamente** um super-admin do Core
    (validado na API), então na prática é um rótulo de responsabilidade,
    não um nível de permissão novo."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    color: str = "#5c6bc4"
    internal_admin_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)


class GroupMembership(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="group.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    added_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    added_at: datetime = Field(default_factory=utcnow)


class Post(SQLModel, table=True):
    """Mural/feed de avisos e lembretes entre colaboradores. `group_id`
    NULL = mural do laboratório (qualquer autenticado vê e publica);
    `group_id` preenchido = mural do grupo (só os membros). Só o
    administrador máximo (ou o admin interno, no mural do grupo) fixa."""

    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    group_id: Optional[int] = Field(default=None, foreign_key="group.id", index=True)
    content: str
    pinned: bool = Field(default=False)
    # Um anexo opcional por aviso (imagem ou PDF) — guardado no banco, mesmo
    # raciocínio da foto de perfil (evita depender de volume/servidor de
    # arquivos). Servido só por GET /posts/{id}/attachment, nunca embutido
    # na listagem.
    attachment: Optional[bytes] = None
    attachment_content_type: Optional[str] = None
    attachment_filename: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class PostReply(SQLModel, table=True):
    """Resposta a um post do mural — thread simples (sem resposta a
    resposta, um nível só, suficiente para o uso de avisos/lembretes)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id", index=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    content: str
    created_at: datetime = Field(default_factory=utcnow)


class AppState(SQLModel, table=True):
    """Chave-valor de estado interno do Core (ex. "qual semana já teve o
    lembrete de aniversários"). Uma linha por chave."""

    key: str = Field(primary_key=True)
    value: str = ""


class Notification(SQLModel, table=True):
    """Aviso pessoal pra um usuário. Hoje é gerado quando alguém te
    menciona (@) num post ou resposta do Mural, ou responde um aviso seu —
    é o que faz o `@menção` valer a pena (sem isto, ninguém vê que foi
    marcado). O sininho do topo (App.tsx) lê daqui."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # destinatário
    kind: str  # "mention" | "reply"
    text: str  # mensagem já pronta pra exibir
    link: str = "/"  # pra onde levar ao clicar
    actor_id: Optional[int] = Field(default=None, foreign_key="user.id")  # quem disparou
    read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Event(SQLModel, table=True):
    """Evento no calendário do laboratório — reunião, seminário, feriado,
    prazo. Diferente de `Reservation` (que é "equipamento ocupado, sem
    sobreposição"): evento não tem regra de conflito e pode ser de dia
    inteiro. Na Fase 1 só o administrador máximo cria e todo mundo vê;
    escopo de grupo (`group_id`) entra na Fase 2."""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = ""
    location: str = ""
    start_at: datetime
    end_at: datetime
    all_day: bool = Field(default=False)
    # NULL = evento do laboratório (só super-admin cria, todos veem);
    # preenchido = evento do grupo (só o admin interno cria, só membros veem).
    group_id: Optional[int] = Field(default=None, foreign_key="group.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)


class EquipmentArea(SQLModel, table=True):
    """Área física do laboratório (ex. "Sala de Cromatografia") — agrupa
    equipamentos na página Equipamentos. Conceito diferente de `Group`
    (que agrupa colaboradores, não equipamentos) — nomes distintos de
    propósito, para não confundir os dois no código."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=utcnow)


class Equipment(SQLModel, table=True):
    """Equipamento reservável na Agenda — conceito separado de `Module`:
    nem todo equipamento tem módulo de software (ex. balança analítica), e
    o inverso também vale (o Horun Core em si não é um equipamento).
    `module_id` liga os dois quando existir."""

    id: str = Field(primary_key=True)  # slug, ex. "re7s", "leco832"
    display_name: str
    color: str = "#15216f"  # usada na legenda/blocos da Agenda
    description: str = ""
    area_id: Optional[int] = Field(default=None, foreign_key="equipmentarea.id", index=True)
    module_id: Optional[str] = Field(default=None, foreign_key="module.id", index=True)
    anydesk_id: str = ""
    pop_folder_path: str = ""
    # Foto servida separada (GET /equipment/{id}/photo), mesmo padrão da
    # foto de perfil do usuário — não pesa a listagem carregando bytes à
    # toa (ver User.photo em routes_auth.py).
    photo: Optional[bytes] = None
    photo_content_type: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class Reservation(SQLModel, table=True):
    """Reserva de uso de um equipamento por um usuário, num intervalo de
    tempo. Duas reservas do mesmo equipamento não podem se sobrepor — ver
    validação em app/api/routes_reservations.py."""

    id: Optional[int] = Field(default=None, primary_key=True)
    equipment_id: str = Field(foreign_key="equipment.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = ""
    start_at: datetime
    end_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
