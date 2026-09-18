"""
CareBridge AI - Discharge Understanding Agent

Converts raw discharge paperwork or structured discharge datasets
into a validated DischargeProfile.
"""
from typing import Any, Dict, Union
from app.schemas.clinical import DischargeProfile


class DischargeUnderstandingAgent:
    """Agent responsible for understanding and structuring discharge instructions."""

    def __init__(self) -> None:
        self.name = "Discharge Understanding Agent"

    def run(self, discharge_data: Union[Dict[str, Any], DischargeProfile]) -> DischargeProfile:
        """
        Convert discharge data into the validated DischargeProfile schema.

        The current implementation uses the structured synthetic discharge
        data as the source of truth. LLM-based extraction can augment this in later stages.
        """
        if isinstance(discharge_data, DischargeProfile):
            return discharge_data
        return DischargeProfile.model_validate(discharge_data)