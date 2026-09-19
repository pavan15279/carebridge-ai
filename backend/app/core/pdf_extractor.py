"""
CareBridge AI - Clinical Document & PDF Text Extractor

Provides safe, deterministic text extraction from clinical discharge paperwork (.pdf, .txt).
Uses pypdf to extract readable text streams from PDF pages without data fabrication.
Returns a user-friendly error if a PDF has no extractable text (e.g. scanned image).
"""
import io
import base64
from typing import Optional
import pypdf

ERROR_UNREADABLE_PDF = (
    "Unable to extract text from this PDF. Please upload a text-based PDF or TXT discharge summary."
)


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """
    Extracts text from raw PDF bytes using pypdf.
    Raises ValueError with ERROR_UNREADABLE_PDF if extraction yields no text.
    """
    if not pdf_bytes:
        raise ValueError(ERROR_UNREADABLE_PDF)

    try:
        stream = io.BytesIO(pdf_bytes)
        reader = pypdf.PdfReader(stream)

        extracted_pages = []
        for idx, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                extracted_pages.append(page_text.strip())

        full_text = "\n\n".join(extracted_pages).strip()
        if not full_text:
            raise ValueError(ERROR_UNREADABLE_PDF)

        return full_text
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(ERROR_UNREADABLE_PDF) from e


def extract_discharge_text(
    filename: str,
    content: Optional[str] = None,
    content_base64: Optional[str] = None
) -> str:
    """
    Unified extractor for discharge paperwork (.pdf or .txt/.text).
    Decodes base64 or raw string, inspects filename extension,
    and extracts text safely.
    """
    filename_lower = (filename or "").lower()
    is_pdf = filename_lower.endswith(".pdf")

    # If base64 payload is provided
    if content_base64 and content_base64.strip():
        try:
            # Handle possible data URL prefix (e.g. data:application/pdf;base64,...)
            clean_b64 = content_base64.strip()
            if "," in clean_b64:
                clean_b64 = clean_b64.split(",", 1)[1]
            raw_bytes = base64.b64decode(clean_b64)
        except Exception as e:
            raise ValueError("Invalid base64 document payload.") from e

        if is_pdf or raw_bytes.startswith(b"%PDF"):
            return extract_text_from_pdf_bytes(raw_bytes)
        else:
            try:
                return raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                return raw_bytes.decode("latin-1", errors="replace")

    # If content string is provided
    if content is not None:
        # Check if content itself is a base64 encoded PDF or raw text
        stripped = content.strip()
        if is_pdf or stripped.startswith("%PDF") or stripped.startswith("JVBERi0"):  # %PDF in base64
            # Attempt base64 decode if it doesn't look like raw text
            if stripped.startswith("JVBERi0") or (is_pdf and not stripped.startswith("%PDF")):
                try:
                    clean_b64 = stripped.split(",", 1)[1] if "," in stripped else stripped
                    pdf_bytes = base64.b64decode(clean_b64)
                    return extract_text_from_pdf_bytes(pdf_bytes)
                except Exception:
                    pass
            # If it starts with %PDF as string, encode to latin1 bytes
            if stripped.startswith("%PDF"):
                return extract_text_from_pdf_bytes(stripped.encode("latin-1", errors="ignore"))

        # Plain text
        if stripped:
            return stripped
        raise ValueError("Discharge summary content cannot be empty.")

    raise ValueError("No discharge summary document content provided.")
