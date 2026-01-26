import { SavedFilter, SavedFiltersCollection, TraceLogFilter } from "../models/interfaces";

const SETTINGS_KEY = "dataverse-trace-analyzer-filters";

/**
 * Utility class for managing saved filters using PPTB tool settings
 */
export class FilterStorage {
    /**
     * Load all saved filters from tool settings
     */
    static async loadFilters(): Promise<SavedFilter[]> {
        try {
            if (!window.toolboxAPI) {
                console.warn("PPTB API not available");
                return [];
            }

            const settings = await window.toolboxAPI.settings.get(SETTINGS_KEY);
            if (settings && settings.filters) {
                return settings.filters as SavedFilter[];
            }
            return [];
        } catch (error) {
            console.error("Error loading saved filters:", error);
            return [];
        }
    }

    /**
     * Save a new filter with a name
     */
    static async saveFilter(name: string, filter: TraceLogFilter): Promise<void> {
        try {
            if (!window.toolboxAPI) {
                throw new Error("PPTB API not available");
            }

            const existingFilters = await this.loadFilters();
            
            // Check if filter with this name already exists
            const existingIndex = existingFilters.findIndex(f => f.name === name);
            
            const newFilter: SavedFilter = {
                name,
                filter,
                createdAt: new Date().toISOString()
            };

            if (existingIndex >= 0) {
                // Update existing filter
                existingFilters[existingIndex] = newFilter;
            } else {
                // Add new filter
                existingFilters.push(newFilter);
            }

            const collection: SavedFiltersCollection = {
                filters: existingFilters
            };

            await window.toolboxAPI.settings.set(SETTINGS_KEY, collection);
        } catch (error) {
            console.error("Error saving filter:", error);
            throw error;
        }
    }

    /**
     * Delete a saved filter by name
     */
    static async deleteFilter(name: string): Promise<void> {
        try {
            if (!window.toolboxAPI) {
                throw new Error("PPTB API not available");
            }

            const existingFilters = await this.loadFilters();
            const updatedFilters = existingFilters.filter(f => f.name !== name);

            const collection: SavedFiltersCollection = {
                filters: updatedFilters
            };

            await window.toolboxAPI.settings.set(SETTINGS_KEY, collection);
        } catch (error) {
            console.error("Error deleting filter:", error);
            throw error;
        }
    }

    /**
     * Get a specific saved filter by name
     */
    static async getFilter(name: string): Promise<SavedFilter | null> {
        try {
            const filters = await this.loadFilters();
            return filters.find(f => f.name === name) || null;
        } catch (error) {
            console.error("Error getting filter:", error);
            return null;
        }
    }
}
