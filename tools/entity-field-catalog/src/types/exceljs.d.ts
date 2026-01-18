import "exceljs";

declare module "exceljs" {
  interface WorksheetDataValidationManager {
    add(range: string, options: DataValidation): void;
    get(range: string): DataValidation | undefined;
    remove(range: string): void;
    model: Record<string, DataValidation>;
  }

  interface Worksheet {
    dataValidations: WorksheetDataValidationManager;
  }
}
