#!/usr/bin/env python3
"""
Ollama File & Git Bridge
Provides local file system and Git/GH execution capabilities to Ollama models.
Requires: pip install ollama
"""

import os
import sys
import subprocess
from pathlib import Path

try:
    import ollama
except ImportError:
    print("[!] 'ollama' library not found. Install it with: pip install ollama")
    sys.exit(1)


# --- 1. TOOL DEFINITIONS ---

def read_file(path: str) -> str:
    """Read the complete text content of a file."""
    try:
        p = Path(path).resolve()
        if not p.exists():
            return f"Error: File does not exist at '{path}'"
        if not p.is_file():
            return f"Error: '{path}' is not a regular file."
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"Error reading file '{path}': {e}"


def write_file(path: str, content: str) -> str:
    """Write text content to a file, creating parent directories if needed."""
    try:
        p = Path(path).resolve()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Successfully wrote {len(content)} characters to '{path}'"
    except Exception as e:
        return f"Error writing file '{path}': {e}"


def list_directory(path: str = ".") -> str:
    """List files and subdirectories at a given directory path."""
    try:
        p = Path(path).resolve()
        if not p.exists():
            return f"Error: Path '{path}' does not exist."
        items = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        lines = [f"{'[DIR] ' if item.is_dir() else '[FILE]'} {item.name}" for item in items]
        return "\n".join(lines) if lines else "(Directory is empty)"
    except Exception as e:
        return f"Error listing directory '{path}': {e}"


def run_command(command: str) -> str:
    """Run a local git, gh, or shell command and return its stdout and stderr."""
    try:
        res = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=60
        )
        output = []
        if res.stdout:
            output.append(res.stdout.strip())
        if res.stderr:
            output.append(f"[STDERR]:\n{res.stderr.strip()}")
        if res.returncode != 0:
            output.append(f"[Exit Code: {res.returncode}]")
        return "\n".join(output) if output else "(Command executed with no output)"
    except subprocess.TimeoutExpired:
        return f"Error: Command timed out after 60 seconds: {command}"
    except Exception as e:
        return f"Execution error for '{command}': {e}"


# Registered tool dictionary for dispatch
TOOL_REGISTRY = {
    "read_file": read_file,
    "write_file": write_file,
    "list_directory": list_directory,
    "run_command": run_command,
}

TOOLS = [read_file, write_file, list_directory, run_command]


# --- 2. AGENT CONVERSATION LOOP ---

def main():
    model = sys.argv[1] if len(sys.argv) > 1 else "llama3.1"
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

    print(f"=== Ollama File & Git Agent ===")
    print(f"Target Model : {model}")
    print(f"Ollama Host  : {host}")
    print(f"Working Dir  : {os.getcwd()}")
    print(f"Type 'exit' or 'quit' to end.\n")

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert AI software engineer with native access to the local machine.\n"
                "You have access to tools: read_file, write_file, list_directory, and run_command.\n"
                "Use run_command to execute git or gh commands (e.g., git status, git diff, gh repo list).\n"
                "Always inspect files before modifying them, and explain your steps clearly."
            ),
        }
    ]

    client = ollama.Client(host=host)

    while True:
        try:
            user_input = input("\nYou > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit"):
            break

        messages.append({"role": "user", "content": user_input})

        # Multi-turn tool execution loop
        while True:
            try:
                response = client.chat(
                    model=model,
                    messages=messages,
                    tools=TOOLS,
                )
            except Exception as e:
                print(f"[!] Ollama API error: {e}")
                break

            msg = response["message"]
            messages.append(msg)

            # If no tools requested, print model's final response and await next user prompt
            tool_calls = msg.get("tool_calls")
            if not tool_calls:
                print(f"\nOllama > {msg.get('content', '')}")
                break

            # Execute requested tools and append responses
            for call in tool_calls:
                fn_name = call["function"]["name"]
                fn_args = call["function"]["arguments"]
                print(f"[*] Tool Call -> {fn_name}({fn_args})")

                if fn_name in TOOL_REGISTRY:
                    result = TOOL_REGISTRY[fn_name](**fn_args)
                else:
                    result = f"Error: Tool '{fn_name}' is not recognized."

                messages.append({
                    "role": "tool",
                    "content": str(result),
                })


if __name__ == "__main__":
    main()
