import axios, { AxiosInstance } from 'axios';
import { DataverseCredentials, Entity, View } from '../models/interfaces';

export class DataverseClient {
    private axiosInstance: AxiosInstance;
    private isPPTB: boolean;

    constructor(credentials: DataverseCredentials, isPPTB: boolean = false) {
        this.isPPTB = isPPTB;
        
        // Create axios instance with base configuration
        this.axiosInstance = axios.create({
            baseURL: `${credentials.environmentUrl}/api/data/v9.2`,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'OData-MaxVersion': '4.0',
                'OData-Version': '4.0',
            },
        });

        // Add request interceptor to get fresh token for PPTB
        this.axiosInstance.interceptors.request.use(async (config) => {
            if (this.isPPTB && window.toolboxAPI) {
                try {
                    const token = await window.toolboxAPI.connections.getAccessToken();
                    config.headers.Authorization = `Bearer ${token}`;
                } catch (error) {
                    console.error('Failed to get access token:', error);
                }
            } else if (credentials.accessToken) {
                config.headers.Authorization = `Bearer ${credentials.accessToken}`;
            }
            return config;
        });
    }

    async listEntities(): Promise<Entity[]> {
        try {
            const response = await this.axiosInstance.get('/EntityDefinitions', {
                params: {
                    $select: 'LogicalName,DisplayName,ObjectTypeCode',
                    $filter: 'IsValidForAdvancedFind eq true and IsCustomizable/Value eq true',
                    $orderby: 'LogicalName'
                }
            });

            return response.data.value.map((entity: any) => ({
                logicalName: entity.LogicalName,
                displayName: entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName,
                objectTypeCode: entity.ObjectTypeCode
            }));
        } catch (error: any) {
            console.error('Failed to fetch entities:', error);
            throw new Error(`Failed to fetch entities: ${error.message}`);
        }
    }

    async listViews(entityLogicalName: string): Promise<View[]> {
        try {
            // Fetch saved queries (system views)
            const savedQueriesResponse = await this.axiosInstance.get('/savedqueries', {
                params: {
                    $select: 'savedqueryid,name,fetchxml,layoutxml,returnedtypecode,querytype',
                    $filter: `returnedtypecode eq '${entityLogicalName}' and statecode eq 0`,
                    $orderby: 'name'
                }
            });

            const views: View[] = savedQueriesResponse.data.value.map((view: any) => ({
                savedqueryid: view.savedqueryid,
                name: view.name,
                fetchxml: view.fetchxml,
                layoutxml: view.layoutxml,
                returnedtypecode: view.returnedtypecode,
                querytype: view.querytype
            }));

            return views;
        } catch (error: any) {
            console.error('Failed to fetch views:', error);
            throw new Error(`Failed to fetch views: ${error.message}`);
        }
    }

    async getView(viewId: string): Promise<View> {
        try {
            const response = await this.axiosInstance.get(`/savedqueries(${viewId})`, {
                params: {
                    $select: 'savedqueryid,name,fetchxml,layoutxml,returnedtypecode,querytype'
                }
            });

            return {
                savedqueryid: response.data.savedqueryid,
                name: response.data.name,
                fetchxml: response.data.fetchxml,
                layoutxml: response.data.layoutxml,
                returnedtypecode: response.data.returnedtypecode,
                querytype: response.data.querytype
            };
        } catch (error: any) {
            console.error('Failed to fetch view:', error);
            throw new Error(`Failed to fetch view: ${error.message}`);
        }
    }

    async updateViewLayout(viewId: string, layoutXml: string): Promise<void> {
        try {
            await this.axiosInstance.patch(`/savedqueries(${viewId})`, {
                layoutxml: layoutXml
            });
        } catch (error: any) {
            console.error('Failed to update view layout:', error);
            throw new Error(`Failed to update view layout: ${error.message}`);
        }
    }
}
