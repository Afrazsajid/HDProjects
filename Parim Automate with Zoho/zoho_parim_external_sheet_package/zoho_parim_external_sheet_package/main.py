import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent

FIRST_FILE = BASE_DIR / "Signup Pack Data" / "transform_pending_rows_to_parim.py"
SECOND_FILE = BASE_DIR / "Parim Automation with Zoho" / "parim_user_creator_zoho_workdrive_docs.py"

def run_python_file(file_path):
    print(f"\nRunning: {file_path}")

    result = subprocess.run(["python", str(file_path)], text=True)

    if result.returncode != 0:
        print(f"Failed: {file_path}")
        sys.exit(result.returncode)

    print(f"Completed: {file_path}")

def main():
    run_python_file(FIRST_FILE)
    run_python_file(SECOND_FILE)
    print("\nBoth Python files completed successfully.")

if __name__ == "__main__":
    main()