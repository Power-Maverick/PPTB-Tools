import { ColumnConfiguration, CustomColumn } from '../models/interfaces';

const SETTINGS_KEY = 'entity-field-catalog-configurations';

/**
 * Utility class for managing column configurations using PPTB tool settings
 */
export class ConfigurationManager {
  /**
   * Save a configuration to PPTB settings
   */
  static async saveConfiguration(name: string, columns: CustomColumn[]): Promise<ColumnConfiguration> {
    try {
      if (!window.toolboxAPI) {
        throw new Error('PPTB API not available');
      }

      const configurations = await this.loadConfigurations();
      
      const newConfig: ColumnConfiguration = {
        id: this.generateId(),
        name,
        columns,
        createdAt: Date.now(),
      };
      
      configurations.push(newConfig);
      await this.saveToStorage(configurations);
      
      return newConfig;
    } catch (error) {
      console.error('Failed to save configuration:', error);
      throw new Error('Failed to save configuration to PPTB settings');
    }
  }
  
  /**
   * Load all configurations from PPTB settings
   */
  static async loadConfigurations(): Promise<ColumnConfiguration[]> {
    try {
      if (!window.toolboxAPI) {
        console.warn('PPTB API not available');
        return [];
      }
      
      const settings = await window.toolboxAPI.settings.get(SETTINGS_KEY);
      if (settings && settings.configurations) {
        return settings.configurations as ColumnConfiguration[];
      }
      return [];
    } catch (error) {
      console.error('Failed to load configurations:', error);
      return [];
    }
  }
  
  /**
   * Delete a configuration by ID
   */
  static async deleteConfiguration(id: string): Promise<void> {
    try {
      if (!window.toolboxAPI) {
        throw new Error('PPTB API not available');
      }

      const configurations = await this.loadConfigurations();
      const filtered = configurations.filter(config => config.id !== id);
      await this.saveToStorage(filtered);
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      throw new Error('Failed to delete configuration from PPTB settings');
    }
  }
  
  /**
   * Get a configuration by ID
   */
  static async getConfiguration(id: string): Promise<ColumnConfiguration | null> {
    try {
      const configurations = await this.loadConfigurations();
      return configurations.find(config => config.id === id) || null;
    } catch (error) {
      console.error('Failed to get configuration:', error);
      return null;
    }
  }
  
  /**
   * Update an existing configuration
   */
  static async updateConfiguration(id: string, name: string, columns: CustomColumn[]): Promise<boolean> {
    try {
      if (!window.toolboxAPI) {
        throw new Error('PPTB API not available');
      }

      const configurations = await this.loadConfigurations();
      const index = configurations.findIndex(config => config.id === id);
      
      if (index === -1) return false;
      
      configurations[index] = {
        ...configurations[index],
        name,
        columns,
      };
      
      await this.saveToStorage(configurations);
      return true;
    } catch (error) {
      console.error('Failed to update configuration:', error);
      throw new Error('Failed to update configuration in PPTB settings');
    }
  }
  
  private static async saveToStorage(configurations: ColumnConfiguration[]): Promise<void> {
    try {
      if (!window.toolboxAPI) {
        throw new Error('PPTB API not available');
      }

      await window.toolboxAPI.settings.set(SETTINGS_KEY, {
        configurations,
      });
    } catch (error) {
      console.error('Failed to save to PPTB settings:', error);
      throw new Error('Failed to save configuration to PPTB settings');
    }
  }
  
  private static generateId(): string {
    return `config-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
