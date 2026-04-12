import json

from app.agent.llm_client import call_llm
from app.agent.prompts import SYSTEM_PROMPT, build_user_prompt
from app.agent.schemas import WeekPlanResult
from app.models.weekly_goal import WeeklyGoal


def _extract_json_payload(raw_text: str) -> str:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"LLM did not return valid JSON object: {raw_text[:300]}")
    return text[start : end + 1]


def plan_week(goal: WeeklyGoal) -> WeekPlanResult:
    user_prompt = build_user_prompt(
        weekly_goal_id=goal.id or 0,
        title=goal.title,
        description=goal.description,
        week_start_date=str(goal.week_start_date),
    )
    raw_output = call_llm(SYSTEM_PROMPT, user_prompt)

    try:
        payload_text = _extract_json_payload(raw_output)
        payload = json.loads(payload_text)
        result = WeekPlanResult.model_validate(payload)
    except Exception as exc:
        raise ValueError(f"Failed to parse LLM plan output: {raw_output[:500]}") from exc

    if goal.id is not None:
        result.weekly_goal_id = goal.id
    return result
