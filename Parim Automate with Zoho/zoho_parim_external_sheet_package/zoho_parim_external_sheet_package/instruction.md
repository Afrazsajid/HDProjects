# Main Script Execution Guide




## Run the Main Script

### Open Command Prompt

Navigate to the project directory:

```cmd
cd "C:\Users\Afraz\HDProjects\Parim Automate with Zoho\zoho_parim_external_sheet_package\zoho_parim_external_sheet_package"
```

### Execute the Main File

```cmd
python main.py
```



---

## Expected Output

```text
Running: Signup Pack Data\transform_pending_rows_to_parim.py
Completed: Signup Pack Data\transform_pending_rows_to_parim.py

Running: Parim Automation with Zoho\parim_user_creator_zoho_workdrive_docs.py
Completed: Parim Automation with Zoho\parim_user_creator_zoho_workdrive_docs.py

Both Python files completed successfully.
```

---



## Overview

This project uses `main.py` to execute two Python scripts sequentially:

1. `Signup Pack Data/transform_pending_rows_to_parim.py`
2. `Parim Automation with Zoho/parim_user_creator_zoho_workdrive_docs.py`

The `main.py` script ensures that the first script completes successfully before starting the second one.

---

## Prerequisites

* Python 3.x installed
* All required Python packages installed
* Project folder structure maintained as follows:

```text
Project Folder/
│
├── main.py
│
├── Signup Pack Data/
│   └── transform_pending_rows_to_parim.py
│
└── Parim Automation with Zoho/
    └── parim_user_creator_zoho_workdrive_docs.py
```

---

## Troubleshooting

### Check Python Installation

```cmd
python --version
```

or

```cmd
py --version
```

### Install Dependencies

If any module is missing:

```cmd
pip install -r requirements.txt
```

### Permission Issues

Run Command Prompt as Administrator if required.

---

## Notes

* The second script will only run if the first script completes successfully.
* If either script fails, execution stops immediately and an error code is returned.
* Keep all folders and file names unchanged unless `main.py` is updated accordingly.
