import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DataverseEntity, ExportFormat } from "../models/interfaces";

/**
 * Utility class for exporting entity and field metadata
 */
export class ExportUtil {
  /**
   * Export entities and fields to the specified format
   */
  static async export(
    entities: DataverseEntity[],
    format: ExportFormat,
    solutionName: string,
  ): Promise<void> {
    if (format === "Excel") {
      await this.exportToExcel(entities, solutionName);
      return;
    }

    if (format === "CSV") {
      await this.exportToCsvArchive(entities, solutionName);
      return;
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Export data to Excel format using ExcelJS
   */
  private static async exportToExcel(
    entities: DataverseEntity[],
    solutionName: string,
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();

    this.addEntitySummaryWorksheet(workbook, entities);
    this.addEntityFieldWorksheets(workbook, entities);

    const fileName = `${solutionName}-entity-field-catalog.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    this.downloadBlob(blob, fileName);
  }

  private static addEntitySummaryWorksheet(
    workbook: ExcelJS.Workbook,
    entities: DataverseEntity[],
  ): void {
    const worksheet = workbook.addWorksheet("Entities");
    worksheet.columns = [
      { header: "Entity Display Name", key: "entityDisplayName", width: 28 },
      { header: "Entity Logical Name", key: "entityLogicalName", width: 28 },
      { header: "Entity Schema Name", key: "entitySchemaName", width: 28 },
      { header: "Primary ID Attribute", key: "primaryIdAttribute", width: 24 },
      {
        header: "Primary Name Attribute",
        key: "primaryNameAttribute",
        width: 24,
      },
      { header: "Object Type Code", key: "objectTypeCode", width: 20 },
      { header: "Description", key: "entityDescription", width: 40 },
      { header: "Field Count", key: "fieldCount", width: 14 },
    ];

    this.styleHeaderRow(worksheet.getRow(1));

    entities.forEach((entity) => {
      worksheet.addRow({
        entityDisplayName: entity.displayName,
        entityLogicalName: entity.logicalName,
        entitySchemaName: entity.schemaName,
        primaryIdAttribute: entity.primaryIdAttribute,
        primaryNameAttribute: entity.primaryNameAttribute,
        objectTypeCode: entity.objectTypeCode ?? "",
        entityDescription: entity.description || "",
        fieldCount: entity.fields.length,
      });
    });

    this.applyAlternatingRowFill(worksheet);
  }

  private static addEntityFieldWorksheets(
    workbook: ExcelJS.Workbook,
    entities: DataverseEntity[],
  ): void {
    const usedNames = new Set<string>(["Entities"]);

    entities.forEach((entity) => {
      const sheetName = this.sanitizeWorksheetName(
        entity.displayName || entity.logicalName,
        usedNames,
      );
      usedNames.add(sheetName);

      const worksheet = workbook.addWorksheet(sheetName);
      worksheet.columns = [
        { header: "Field Display Name", key: "fieldDisplayName", width: 28 },
        { header: "Field Logical Name", key: "fieldLogicalName", width: 28 },
        { header: "Field Schema Name", key: "fieldSchemaName", width: 28 },
        { header: "Field Type", key: "fieldType", width: 18 },
        { header: "Is Primary ID", key: "isPrimaryId", width: 16 },
        { header: "Is Primary Name", key: "isPrimaryName", width: 16 },
        { header: "Is Required", key: "isRequired", width: 16 },
        { header: "Field Description", key: "fieldDescription", width: 40 },
      ];

      this.styleHeaderRow(worksheet.getRow(1));

      entity.fields.forEach((field) => {
        worksheet.addRow({
          fieldDisplayName: field.displayName,
          fieldLogicalName: field.logicalName,
          fieldSchemaName: field.schemaName,
          fieldType: field.type,
          isPrimaryId: field.isPrimaryId ? "Yes" : "No",
          isPrimaryName: field.isPrimaryName ? "Yes" : "No",
          isRequired: field.isRequired ? "Yes" : "No",
          fieldDescription: field.description || "",
        });
      });

      this.applyAlternatingRowFill(worksheet);
    });
  }

  private static styleHeaderRow(row: ExcelJS.Row): void {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0078D4" },
    };
    row.alignment = { vertical: "middle", horizontal: "left" };
    row.height = 20;
  }

  private static applyAlternatingRowFill(
    worksheet: ExcelJS.Worksheet,
    headerRowIndex = 1,
  ): void {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > headerRowIndex && rowNumber % 2 === 0) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F4F6" },
        };
      }
    });
  }

  private static sanitizeWorksheetName(
    name: string,
    usedNames: Set<string>,
  ): string {
    const invalidChars = /[\\/?*\[\]:]/g;
    let sanitized = name.replace(invalidChars, " ").trim() || "Entity";

    if (sanitized.length > 31) {
      sanitized = sanitized.slice(0, 31).trim();
    }

    let uniqueName = sanitized;
    let suffix = 1;
    while (usedNames.has(uniqueName)) {
      const suffixText = ` (${suffix++})`;
      const baseLength = 31 - suffixText.length;
      uniqueName = `${sanitized.slice(0, baseLength)}${suffixText}`;
    }

    return uniqueName;
  }
  private static downloadBlob(blob: Blob, fileName: string): void {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  private static async exportToCsvArchive(
    entities: DataverseEntity[],
    solutionName: string,
  ): Promise<void> {
    if (entities.length === 0) {
      throw new Error("No entities selected for export");
    }

    const zip = new JSZip();
    zip.file("Entities.csv", this.buildEntitySummaryCsv(entities));

    const usedNames = new Set<string>();
    entities.forEach((entity) => {
      const fileName = this.sanitizeFileName(
        entity.displayName || entity.logicalName,
        usedNames,
      );
      usedNames.add(fileName);
      zip.file(`${fileName}.csv`, this.buildEntityFieldCsv(entity));
    });

    const content = await zip.generateAsync({ type: "blob" });
    const archiveName = `${solutionName}-entity-field-catalog.zip`;
    this.downloadBlob(content, archiveName);
  }

  private static buildEntitySummaryCsv(entities: DataverseEntity[]): string {
    const headers = [
      "Entity Display Name",
      "Entity Logical Name",
      "Entity Schema Name",
      "Primary ID Attribute",
      "Primary Name Attribute",
      "Object Type Code",
      "Description",
      "Field Count",
    ];

    const rows = entities.map((entity) => [
      entity.displayName,
      entity.logicalName,
      entity.schemaName,
      entity.primaryIdAttribute,
      entity.primaryNameAttribute,
      entity.objectTypeCode ?? "",
      entity.description ?? "",
      entity.fields.length.toString(),
    ]);

    return this.toCsv([headers, ...rows]);
  }

  private static buildEntityFieldCsv(entity: DataverseEntity): string {
    const headers = [
      "Field Display Name",
      "Field Logical Name",
      "Field Schema Name",
      "Field Type",
      "Is Primary ID",
      "Is Primary Name",
      "Is Required",
      "Field Description",
    ];

    const rows = entity.fields.map((field) => [
      field.displayName,
      field.logicalName,
      field.schemaName,
      field.type,
      field.isPrimaryId ? "Yes" : "No",
      field.isPrimaryName ? "Yes" : "No",
      field.isRequired ? "Yes" : "No",
      field.description ?? "",
    ]);

    return this.toCsv([headers, ...rows]);
  }

  private static toCsv(
    rows: (string | number | boolean | null | undefined)[][],
  ): string {
    return rows
      .map((row) =>
        row
          .map((cell) => {
            const value = cell ?? "";
            const text = typeof value === "string" ? value : String(value);
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");
  }

  private static sanitizeFileName(
    name: string,
    usedNames: Set<string>,
  ): string {
    const invalidChars = /[<>:"/\\|?*]/g;
    let sanitized = name.replace(invalidChars, " ").trim() || "Entity";

    if (sanitized.length > 60) {
      sanitized = sanitized.slice(0, 60).trim();
    }

    let uniqueName = sanitized;
    let suffix = 1;
    while (usedNames.has(uniqueName)) {
      const suffixText = `_${suffix++}`;
      const baseLength = Math.max(1, 60 - suffixText.length);
      uniqueName = `${sanitized.slice(0, baseLength)}${suffixText}`;
    }

    return uniqueName;
  }
}
