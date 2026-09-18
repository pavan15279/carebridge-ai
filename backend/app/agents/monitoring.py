"""
CareBridge AI - Monitoring Agent

Tracks daily patient recovery tasks, computes compliance rates,
and identifies pending, missed, and completed care actions.
"""
from typing import Any, Dict, List, Optional, Union
from app.schemas.clinical import CareTask, TaskStatus


class MonitoringAgent:
    """Agent responsible for tracking task execution and adherence telemetry."""

    def __init__(self) -> None:
        self.name = "Monitoring Agent"

    def run(
        self,
        tasks: List[Union[CareTask, Dict[str, Any]]],
        patient_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate patient recovery tasks and return structured adherence telemetry.

        Identifies:
          - Completed tasks
          - Pending tasks
          - Missed tasks
          - Skipped tasks
          - Overall adherence percentage
        """
        parsed_tasks: List[CareTask] = []
        for t in tasks:
            if isinstance(t, CareTask):
                parsed_tasks.append(t)
            else:
                parsed_tasks.append(CareTask.model_validate(t))

        completed: List[Dict[str, Any]] = []
        pending: List[Dict[str, Any]] = []
        missed: List[Dict[str, Any]] = []
        skipped: List[Dict[str, Any]] = []

        for task in parsed_tasks:
            task_dict = task.model_dump(mode="json")
            if task.status == TaskStatus.COMPLETED:
                completed.append(task_dict)
            elif task.status == TaskStatus.PENDING:
                pending.append(task_dict)
            elif task.status == TaskStatus.MISSED:
                missed.append(task_dict)
            elif task.status == TaskStatus.SKIPPED:
                skipped.append(task_dict)

        total_tasks = len(parsed_tasks)
        adherence_percentage = (
            round((len(completed) / total_tasks) * 100.0, 1) if total_tasks > 0 else 0.0
        )

        effective_patient_id = patient_id or (parsed_tasks[0].patient_id if parsed_tasks else "UNKNOWN")

        return {
            "patient_id": effective_patient_id,
            "total_tasks": total_tasks,
            "completed_count": len(completed),
            "pending_count": len(pending),
            "missed_count": len(missed),
            "skipped_count": len(skipped),
            "adherence_percentage": adherence_percentage,
            "completed_tasks": completed,
            "pending_tasks": pending,
            "missed_tasks": missed,
            "skipped_tasks": skipped,
        }
