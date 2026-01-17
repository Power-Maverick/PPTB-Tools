import ExcelJS from "exceljs";
import { CustomColumn, DataverseEntity } from "../models/interfaces";

/**
 * Utility class for exporting entity and field metadata
 */
export class ExportUtil {
  /**
   * Export entities and fields to Excel format with optional custom columns
   */
  static async export(
    entities: DataverseEntity[],
    solutionName: string,
    customColumns: CustomColumn[] = [],
  ): Promise<void> {
    await this.exportToExcel(entities, solutionName, customColumns);
  }

  /**
   * Export data to Excel format using ExcelJS with custom columns and data validation
   */
  private static async exportToExcel(
    entities: DataverseEntity[],
    solutionName: string,
    customColumns: CustomColumn[] = [],
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();

    this.addEntitySummaryWorksheet(workbook, entities);
    this.addEntityFieldWorksheets(workbook, entities, customColumns);

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
    customColumns: CustomColumn[] = [],
  ): void {
    const usedNames = new Set<string>(["Entities"]);

    entities.forEach((entity) => {
      const sheetName = this.sanitizeWorksheetName(
        entity.displayName || entity.logicalName,
        usedNames,
      );
      usedNames.add(sheetName);

      const worksheet = workbook.addWorksheet(sheetName);
      
      // Define base columns
      const baseColumns: Partial<ExcelJS.Column>[] = [
        { header: "Field Display Name", key: "fieldDisplayName", width: 28 },
        { header: "Field Logical Name", key: "fieldLogicalName", width: 28 },
        { header: "Field Schema Name", key: "fieldSchemaName", width: 28 },
        { header: "Field Type", key: "fieldType", width: 18 },
        { header: "Is Primary ID", key: "isPrimaryId", width: 16 },
        { header: "Is Primary Name", key: "isPrimaryName", width: 16 },
        { header: "Is Required", key: "isRequired", width: 16 },
        { header: "Field Description", key: "fieldDescription", width: 40 },
      ];

      // Add custom columns
      const customColumnDefs: Partial<ExcelJS.Column>[] = customColumns.map((col) => ({
        header: col.name,
        key: `custom_${col.id}`,
        width: 20,
      }));

      worksheet.columns = [...baseColumns, ...customColumnDefs];

      this.styleHeaderRow(worksheet.getRow(1));

      // Add field data rows
      entity.fields.forEach((field, index) => {
        const rowData: any = {
          fieldDisplayName: field.displayName,
          fieldLogicalName: field.logicalName,
          fieldSchemaName: field.schemaName,
          fieldType: field.type,
          isPrimaryId: field.isPrimaryId ? "Yes" : "No",
          isPrimaryName: field.isPrimaryName ? "Yes" : "No",
          isRequired: field.isRequired ? "Yes" : "No",
          fieldDescription: field.description || "",
        };

        // Add default values for custom columns
        customColumns.forEach((col) => {
          rowData[`custom_${col.id}`] = col.defaultValue || "";
        });

        worksheet.addRow(rowData);
      });

      this.applyAlternatingRowFill(worksheet);

      // Add data validation for Yes/No columns (including custom columns if they have Yes/No default values)
      const yesNoColumns = [5, 6, 7]; // isPrimaryId, isPrimaryName, isRequired (1-indexed column numbers)
      
      const totalFields = entity.fields.length;
      if (totalFields > 0) {
        yesNoColumns.forEach((colIndex) => {
          worksheet.dataValidations.add(`${this.getColumnLetter(colIndex)}2:${this.getColumnLetter(colIndex)}${totalFields + 1}`, {
            type: 'list',
            allowBlank: true,
            formulae: ['"Yes,No"'],
            showErrorMessage: true,
            errorStyle: 'error',
            errorTitle: 'Invalid Value',
            error: 'Please select Yes or No from the dropdown',
          });
        });
      }
    });
  }

  /**
   * Get Excel column letter from column number (1-indexed)
   */
  private static getColumnLetter(columnNumber: number): string {
    let columnLetter = '';
    let temp = columnNumber;
    
    while (temp > 0) {
      const remainder = (temp - 1) % 26;
      columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
      temp = Math.floor((temp - 1) / 26);
    }
    
    return columnLetter;
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
}
