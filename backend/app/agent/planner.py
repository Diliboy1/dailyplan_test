import json
from datetime import date as DateType
from datetime import timedelta

from app.agent.llm_client import call_llm
from app.agent.prompts import SYSTEM_PROMPT, build_user_prompt
from app.agent.schemas import DayPlan, TaskItem, WeekPlanDraft, WeekPlanResult
from app.models.weekly_goal import WeeklyGoal

WEEKDAY_FRIDAY = 4
WEEKDAY_SATURDAY = 5


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


def _parse_iso_date(value: str | None) -> DateType | None:
    if not value:
        return None
    try:
        return DateType.fromisoformat(value)
    except ValueError:
        return None


def _normalize_tasks(tasks: list[TaskItem]) -> list[TaskItem]:
    ordered_tasks = sorted(tasks, key=lambda item: item.order_index)
    return [
        task.model_copy(update={"order_index": index})
        for index, task in enumerate(ordered_tasks)
    ]


def _normalize_theme(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _is_active_workday(day_of_week: int, *, start_weekday: int) -> bool:
    if start_weekday > WEEKDAY_FRIDAY:
        return False
    return start_weekday <= day_of_week <= WEEKDAY_FRIDAY


def _normalize_week_plan(goal: WeeklyGoal, draft: WeekPlanDraft) -> WeekPlanResult:
    start_date = goal.week_start_date
    start_weekday = start_date.weekday()
    week_monday = start_date - timedelta(days=start_weekday)

    indexed_days = list(enumerate(draft.days))
    day_index_by_weekday: dict[int, int] = {}
    day_index_by_date: dict[DateType, int] = {}
    parsed_date_by_index: dict[int, DateType] = {}

    for index, day in indexed_days:
        if day.day_of_week is not None and day.day_of_week not in day_index_by_weekday:
            day_index_by_weekday[day.day_of_week] = index
        parsed_date = _parse_iso_date(day.date)
        if parsed_date is not None:
            parsed_date_by_index[index] = parsed_date
            if parsed_date not in day_index_by_date:
                day_index_by_date[parsed_date] = index

    used_indexes: set[int] = set()
    fallback_cursor = 0

    def candidate_weekday(index: int) -> int | None:
        draft_day = draft.days[index]
        if draft_day.day_of_week is not None:
            return draft_day.day_of_week
        parsed_date = parsed_date_by_index.get(index)
        if parsed_date is not None:
            return parsed_date.weekday()
        return None

    def candidate_is_eligible(index: int) -> bool:
        if index in used_indexes:
            return False

        draft_day = draft.days[index]
        if not draft_day.tasks:
            return False

        weekday = candidate_weekday(index)
        if weekday is None:
            # 没有可靠日期/星期信息时，作为最后兜底候选。
            return True

        if weekday >= WEEKDAY_SATURDAY:
            return False
        if weekday < start_weekday:
            return False
        return True

    def pick_candidate_index(day_of_week: int, target_date: DateType) -> int | None:
        nonlocal fallback_cursor

        date_match = day_index_by_date.get(target_date)
        if date_match is not None and candidate_is_eligible(date_match):
            return date_match

        weekday_match = day_index_by_weekday.get(day_of_week)
        if weekday_match is not None and candidate_is_eligible(weekday_match):
            return weekday_match

        while fallback_cursor < len(indexed_days):
            candidate_index, candidate_day = indexed_days[fallback_cursor]
            fallback_cursor += 1
            if candidate_day.tasks and candidate_is_eligible(candidate_index):
                return candidate_index
        return None

    normalized_days: list[DayPlan] = []
    for day_of_week in range(7):
        target_date = week_monday + timedelta(days=day_of_week)
        if not _is_active_workday(day_of_week, start_weekday=start_weekday):
            normalized_days.append(
                DayPlan(
                    day_of_week=day_of_week,
                    date=target_date.isoformat(),
                    theme=None,
                    buffer_percent=20,
                    tasks=[],
                )
            )
            continue

        candidate_index = pick_candidate_index(day_of_week, target_date)
        if candidate_index is None:
            raise ValueError(
                "LLM output missing workday plan for "
                f"{target_date.isoformat()} (day_of_week={day_of_week})"
            )
        used_indexes.add(candidate_index)
        candidate = draft.days[candidate_index]
        tasks = _normalize_tasks(candidate.tasks)
        if not tasks:
            raise ValueError(
                f"LLM output returned empty tasks for active day {target_date.isoformat()} "
                f"(day_of_week={day_of_week})"
            )

        normalized_days.append(
            DayPlan(
                day_of_week=day_of_week,
                date=target_date.isoformat(),
                theme=_normalize_theme(candidate.theme),
                buffer_percent=candidate.buffer_percent,
                tasks=tasks,
            )
        )

    if goal.id is None:
        raise ValueError("Weekly goal id is required for plan generation")

    return WeekPlanResult(weekly_goal_id=goal.id, days=normalized_days)


def plan_week(goal: WeeklyGoal) -> WeekPlanResult:
    user_prompt = build_user_prompt(
        weekly_goal_id=goal.id or 0,
        title=goal.title,
        description=goal.description,
        week_start_date=str(goal.week_start_date),
        start_day_of_week=goal.week_start_date.weekday(),
    )
    raw_output = call_llm(SYSTEM_PROMPT, user_prompt)

    try:
        payload_text = _extract_json_payload(raw_output)
        payload = json.loads(payload_text)
        draft = WeekPlanDraft.model_validate(payload)
        result = _normalize_week_plan(goal, draft)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}. Raw (first 300 chars): {raw_output[:300]}") from exc
    except Exception as exc:
        days_count = len(payload.get("days", [])) if isinstance(payload, dict) else "N/A"
        raise ValueError(
            f"Schema validation failed: {exc}. days_count={days_count}. Raw (first 500 chars): {raw_output[:500]}"
        ) from exc

    return result
