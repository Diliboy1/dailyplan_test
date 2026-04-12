from openai import OpenAI

from app.core.config import get_settings


def call_llm(system_prompt: str, user_prompt: str) -> str:
    settings = get_settings()
    client = OpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
    )

    try:
        response = client.chat.completions.create(
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"LLM request failed: {exc}") from exc

    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise RuntimeError("LLM returned empty content")

    return content
