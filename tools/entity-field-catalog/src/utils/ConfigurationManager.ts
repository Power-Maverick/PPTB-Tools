import { ColumnConfiguration, CustomColumn } from '../models/interfaces';

const STORAGE_KEY = 'entity-field-catalog-configurations';

/**
 * Utility class for managing column configurations
 */
export class ConfigurationManager {
  /**
   * Save a configuration to localStorage
   */
  static saveConfiguration(name: string, columns: CustomColumn[]): ColumnConfiguration {
    const configurations = this.loadConfigurations();
    
    const newConfig: ColumnConfiguration = {
      id: this.generateId(),
      name,
      columns,
      createdAt: Date.now(),
    };
    
    configurations.push(newConfig);
    this.saveToStorage(configurations);
    
    return newConfig;
  }
  
  /**
   * Load all configurations from localStorage
   */
  static loadConfigurations(): ColumnConfiguration[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      
      return JSON.parse(stored) as ColumnConfiguration[];
    } catch (error) {
      console.error('Failed to load configurations:', error);
      return [];
    }
  }
  
  /**
   * Delete a configuration by ID
   */
  static deleteConfiguration(id: string): void {
    const configurations = this.loadConfigurations();
    const filtered = configurations.filter(config => config.id !== id);
    this.saveToStorage(filtered);
  }
  
  /**
   * Get a configuration by ID
   */
  static getConfiguration(id: string): ColumnConfiguration | null {
    const configurations = this.loadConfigurations();
    return configurations.find(config => config.id === id) || null;
  }
  
  /**
   * Update an existing configuration
   */
  static updateConfiguration(id: string, name: string, columns: CustomColumn[]): boolean {
    const configurations = this.loadConfigurations();
    const index = configurations.findIndex(config => config.id === id);
    
    if (index === -1) return false;
    
    configurations[index] = {
      ...configurations[index],
      name,
      columns,
    };
    
    this.saveToStorage(configurations);
    return true;
  }
  
  private static saveToStorage(configurations: ColumnConfiguration[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configurations));
    } catch (error) {
      console.error('Failed to save configurations:', error);
      throw new Error('Failed to save configuration to storage');
    }
  }
  
  private static generateId(): string {
    return `config-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
