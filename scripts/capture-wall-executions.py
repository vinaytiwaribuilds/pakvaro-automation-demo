import json
import sqlite3
import argparse
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATABASE = ROOT / ".n8n-wall" / ".n8n" / "database.sqlite"
DEMOS = {
    "missed-enquiry-rescue": {"pakvaroMissedEnquiryRescue": 6},
    "invoice-email-intake": {"pakvaroInvoiceEmailIntake": 6},
    "ecommerce-order-flow": {"pakvaroEcommerceOrderFlow": 6},
    "crm-lead-routing": {"pakvaroCrmLeadRouting": 9, "pakvaroCrmDailySummary": 1},
}


parser = argparse.ArgumentParser(description="Capture the latest local n8n executions for the demo wall.")
parser.add_argument(
    "--database",
    type=Path,
    default=DEFAULT_DATABASE,
    help="Path to the local n8n database (default: .n8n-wall/.n8n/database.sqlite)",
)
args = parser.parse_args()
database = args.database.resolve()
if not database.is_file():
    parser.error(f"n8n database does not exist: {database}")
try:
    database_label = str(database.relative_to(ROOT))
except ValueError:
    database_label = database.name

connection = sqlite3.connect(database)
connection.row_factory = sqlite3.Row
captured_at = datetime.now(timezone.utc).isoformat()

for demo, workflow_counts in DEMOS.items():
    executions = []
    for workflow_id, count in workflow_counts.items():
        rows = connection.execute(
            """
            SELECT id, workflowId, status, mode, startedAt, stoppedAt, finished
            FROM execution_entity
            WHERE workflowId = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (workflow_id, count),
        ).fetchall()
        executions.extend(dict(row) for row in rows)
    executions.sort(key=lambda item: item["id"])
    document = {
        "capturedAt": captured_at,
        "source": "local n8n SQLite execution_entity",
        "n8nDatabase": database_label,
        "latestPassingSuiteExpectedExecutions": sum(workflow_counts.values()),
        "workflowExecutionCounts": workflow_counts,
        "executions": executions,
    }
    target = ROOT / "demos" / demo / "evidence" / "n8n-executions.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")

connection.close()
print("Captured latest passing-suite n8n executions for 4 demos")
