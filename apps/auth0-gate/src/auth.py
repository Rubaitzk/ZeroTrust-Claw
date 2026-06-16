import os
from typing import Any


def get_admin_role_claim() -> str:
    return os.getenv("AUTH0_ROLE_CLAIM", "https://example.com/roles")


def has_admin_role(user: dict[str, Any] | None) -> bool:
    if not user:
        return False

    claim = get_admin_role_claim()
    roles = user.get(claim) or user.get("roles")
    if roles is None:
        return False

    if isinstance(roles, (list, tuple)):
        return "Admin" in roles

    return "Admin" in str(roles).split(",")
