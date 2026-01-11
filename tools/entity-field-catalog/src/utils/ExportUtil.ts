import * as XLSX from 'xlsx';
import { DataverseEntity, EntityFieldExportData, ExportFormat } from '../models/interfaces';

/**
 * Utility class for exporting entity and field metadata
 */
export class ExportUtil {
  /**
   * Export entities and fields to the specified format
   */
  static export(entities: DataverseEntity[], format: ExportFormat, solutionName: string): void {
    const exportData = this.prepareExportData(entities);
    
    if (format === 'excel') {
      this.exportToExcel(exportData, solutionName);
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
   * Export data to Excel format
   */
  private static exportToExcel(data: EntityFieldExportData[], solutionName: string): void {
    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Convert data to worksheet
    const ws = XLSX.utils.json_to_sheet(data, {
      header: [
        'entityLogicalName',
        'entityDisplayName',
        'entitySchemaName',
        'entityType',
        'entityDescription',
        'fieldLogicalName',
        'fieldDisplayName',
        'fieldSchemaName',
        'fieldType',
        'isPrimaryId',
        'isPrimaryName',
        'isRequired',
        'fieldDescription',
        'maxLength',
        'precision',
        'format',
      ],
    });

    // Set column headers with friendly names
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

    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' });

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Entity Field Catalog');

    // Generate filename
    const fileName = `${solutionName}-entity-field-catalog.xlsx`;

    // Write file
    XLSX.writeFile(wb, fileName);
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
