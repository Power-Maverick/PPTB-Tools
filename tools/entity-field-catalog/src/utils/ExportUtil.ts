import ExcelJS from 'exceljs';
import { DataverseEntity, EntityFieldExportData, ExportFormat } from '../models/interfaces';

/**
 * Utility class for exporting entity and field metadata
 */
export class ExportUtil {
  /**
   * Export entities and fields to the specified format
   */
  static async export(entities: DataverseEntity[], format: ExportFormat, solutionName: string): Promise<void> {
    const exportData = this.prepareExportData(entities);
    
    if (format === 'excel') {
      await this.exportToExcel(exportData, solutionName);
    } else if (format === 'csv') {
      this.exportToCSV(exportData, solutionName);
    }
  }

  /**
   * Prepare data for export
   */
  private static prepareExportData(entities: DataverseEntity[]): EntityFieldExportData[] {
    const data: EntityFieldExportData[] = [];

    for (const entity of entities) {
      for (const field of entity.fields) {
        data.push({
          entityLogicalName: entity.logicalName,
          entityDisplayName: entity.displayName,
          entitySchemaName: entity.schemaName,
          entityType: entity.entityType,
          entityDescription: entity.description || '',
          fieldLogicalName: field.logicalName,
          fieldDisplayName: field.displayName,
          fieldSchemaName: field.schemaName,
          fieldType: field.type,
          isPrimaryId: field.isPrimaryId ? 'Yes' : 'No',
          isPrimaryName: field.isPrimaryName ? 'Yes' : 'No',
          isRequired: field.isRequired ? 'Yes' : 'No',
          fieldDescription: field.description || '',
          maxLength: field.maxLength !== undefined ? field.maxLength.toString() : '',
          precision: field.precision !== undefined ? field.precision.toString() : '',
          format: field.format || '',
        });
      }
    }

    return data;
  }

  /**
   * Export data to Excel format using ExcelJS
   */
  private static async exportToExcel(data: EntityFieldExportData[], solutionName: string): Promise<void> {
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Entity Field Catalog');

    // Define columns with headers
    worksheet.columns = [
      { header: 'Entity Logical Name', key: 'entityLogicalName', width: 25 },
      { header: 'Entity Display Name', key: 'entityDisplayName', width: 25 },
      { header: 'Entity Schema Name', key: 'entitySchemaName', width: 25 },
      { header: 'Entity Type', key: 'entityType', width: 20 },
      { header: 'Entity Description', key: 'entityDescription', width: 35 },
      { header: 'Field Logical Name', key: 'fieldLogicalName', width: 25 },
      { header: 'Field Display Name', key: 'fieldDisplayName', width: 25 },
      { header: 'Field Schema Name', key: 'fieldSchemaName', width: 25 },
      { header: 'Field Type', key: 'fieldType', width: 20 },
      { header: 'Is Primary ID', key: 'isPrimaryId', width: 15 },
      { header: 'Is Primary Name', key: 'isPrimaryName', width: 15 },
      { header: 'Is Required', key: 'isRequired', width: 15 },
      { header: 'Field Description', key: 'fieldDescription', width: 35 },
      { header: 'Max Length', key: 'maxLength', width: 12 },
      { header: 'Precision', key: 'precision', width: 12 },
      { header: 'Format', key: 'format', width: 15 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0078D4' }, // Microsoft blue
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 20;

    // Add data rows
    data.forEach(item => {
      worksheet.addRow(item);
    });

    // Apply alternating row colors for better readability
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' }, // Light gray
        };
      }
    });

    // Generate filename
    const fileName = `${solutionName}-entity-field-catalog.xlsx`;

    // Write to buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    URL.revokeObjectURL(url);
  }

  /**
   * Export data to CSV format
   */
  private static exportToCSV(data: EntityFieldExportData[], solutionName: string): void {
    // Create CSV header
    const headers = [
      'Entity Logical Name',
      'Entity Display Name',
      'Entity Schema Name',
      'Entity Type',
      'Entity Description',
      'Field Logical Name',
      'Field Display Name',
      'Field Schema Name',
      'Field Type',
      'Is Primary ID',
      'Is Primary Name',
      'Is Required',
      'Field Description',
      'Max Length',
      'Precision',
      'Format',
    ];

    // Create CSV rows
    const rows = data.map(item => [
      item.entityLogicalName,
      item.entityDisplayName,
      item.entitySchemaName,
      item.entityType,
      item.entityDescription,
      item.fieldLogicalName,
      item.fieldDisplayName,
      item.fieldSchemaName,
      item.fieldType,
      item.isPrimaryId,
      item.isPrimaryName,
      item.isRequired,
      item.fieldDescription,
      item.maxLength,
      item.precision,
      item.format,
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${solutionName}-entity-field-catalog.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
