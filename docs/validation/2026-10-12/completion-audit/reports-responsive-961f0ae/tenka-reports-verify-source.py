import hashlib,json
from pathlib import Path
p=Path("/tmp/tenka-reports-961f0ae")
overlays={'e2e/report-compact-presentation.spec.ts': '520dad4f8a1b69fef008518838c8a3cd4b2c75c068cdddc802fddad487a960c3', 'src/ui/components/ReportStack/ReportStack.module.css': '0c580065cb9321236a4efe5553fc81fc7cbf6e70660af78c693a3b72c47a14d8', 'src/ui/components/ReportStack/ReportStack.spec.tsx': '3d698fbf9e83009ddd348c73a0485bf4ddaf3303c3ca752b0099c62bb886e5a0'}
rows=json.loads((p/"baseline-source.json").read_text())
for row in rows:
 row["sha256"]=overlays.get(row["path"],row["sha256"])
 assert hashlib.sha256((p/row["path"]).read_bytes()).hexdigest()==row["sha256"],row["path"]
print(json.dumps({"base":"961f0ae","overlays":overlays,"inputCount":len(rows),"inputs":rows},indent=2))
