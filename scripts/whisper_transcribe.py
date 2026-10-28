#!/usr/bin/env python3
import sys
import os
import json
import warnings
import logging

# Suppress all stderr warnings
warnings.filterwarnings("ignore")
logging.captureWarnings(True)
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"

def transcribe(wav_path):
    if not os.path.exists(wav_path):
        return {"success": False, "error": f"File not found: {wav_path}"}
    
    try:
        from transformers import pipeline, logging as hf_logging
        hf_logging.set_verbosity_error()
        
        # Use locally cached openai/whisper-tiny.en
        asr = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-tiny.en"
        )
        res = asr(wav_path)
        text = res.get("text", "").strip() if isinstance(res, dict) else ""
        return {"success": True, "text": text, "confidence": 0.95}
    except Exception as e:
        return {"success": False, "error": str(e), "text": "", "confidence": 0.0}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: whisper_transcribe.py <wav_path>"}))
        sys.exit(1)
        
    wav_path = sys.argv[1]
    result = transcribe(wav_path)
    print(json.dumps(result))
