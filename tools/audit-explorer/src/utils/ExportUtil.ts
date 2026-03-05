import ExcelJS from "exceljs";
import { AuditEntry } from "../models/interfaces";

/**
 * Export audit history entries to an Excel file.
 */
export class ExportUtil {
    static async exportToExcel(entries: AuditEntry[], entityDisplayName: string): Promise<void> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Audit Explorer – PPTB";
        workbook.created = new Date();

        // Summary sheet: one row per audit event
        const summarySheet = workbook.addWorksheet("Audit Summary");
        summarySheet.columns = [
            { header: "Date / Time", key: "createdOn", width: 22 },
            { header: "Changed By", key: "userName", width: 28 },
            { header: "Action", key: "actionLabel", width: 14 },
            { header: "Record ID", key: "recordId", width: 38 },
            { header: "Fields Changed", key: "fieldsChanged", width: 14 },
        ];
        ExportUtil.styleHeaderRow(summarySheet.getRow(1));

        for (const entry of entries) {
            summarySheet.addRow({
                createdOn: entry.createdOn ? new Date(entry.createdOn).toLocaleString() : "",
                userName: entry.userName,
                actionLabel: entry.actionLabel,
                recordId: entry.recordId,
                fieldsChanged: entry.changedFields.length,
            });
        }
        ExportUtil.applyAlternatingFill(summarySheet);

        // Details sheet: one row per changed field
        const detailSheet = workbook.addWorksheet("Field Changes");
        detailSheet.columns = [
            { header: "Date / Time", key: "createdOn", width: 22 },
            { header: "Changed By", key: "userName", width: 28 },
            { header: "Action", key: "actionLabel", width: 14 },
            { header: "Record ID", key: "recordId", width: 38 },
            { header: "Field Logical Name", key: "logicalName", width: 30 },
            { header: "Old Value", key: "oldValue", width: 36 },
            { header: "New Value", key: "newValue", width: 36 },
        ];
        ExportUtil.styleHeaderRow(detailSheet.getRow(1));

        for (const entry of entries) {
            if (entry.changedFields.length === 0) {
                // Still include the event row even with no field details
                detailSheet.addRow({
                    createdOn: entry.createdOn ? new Date(entry.createdOn).toLocaleString() : "",
                    userName: entry.userName,
                    actionLabel: entry.actionLabel,
                    recordId: entry.recordId,
                    logicalName: "",
                    oldValue: "",
                    newValue: "",
                });
            } else {
                for (const field of entry.changedFields) {
                    detailSheet.addRow({
                        createdOn: entry.createdOn ? new Date(entry.createdOn).toLocaleString() : "",
                        userName: entry.userName,
                        actionLabel: entry.actionLabel,
                        recordId: entry.recordId,
                        logicalName: field.logicalName,
                        oldValue: field.oldValue,
                        newValue: field.newValue,
                    });
                }
            }
        }
        ExportUtil.applyAlternatingFill(detailSheet);

        const timestamp = new Date().toISOString().slice(0, 10);
        const safeName = entityDisplayName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
        const fileName = `audit-${safeName}-${timestamp}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    private static styleHeaderRow(row: ExcelJS.Row): void {
        row.font = { bold: true, color: { argb: "FFFFFFFF" } };
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0078D4" } };
        row.alignment = { vertical: "middle", horizontal: "left" };
        row.height = 20;
    }

    private static applyAlternatingFill(worksheet: ExcelJS.Worksheet): void {
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1 && rowNumber % 2 === 0) {
                row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
            }
        });
    }
}
