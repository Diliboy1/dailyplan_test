# Phase 2 新增
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
