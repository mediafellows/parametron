import Promise from 'bluebird';
import { IConfig } from 'chipmunk';
export interface IParametronOpts {
    model: 'pm.product' | 'am.asset';
    stats?: string;
    schema: string;
    immediate?: boolean;
    action?: string;
    params?: any;
    init?: (api: Parametron) => void;
    update?: (data: IParametronData) => void;
}
export interface IParametronData {
    page: number;
    per: number;
    sort: string;
    order: string;
    totalCount: number;
    totalPages: number;
    running: boolean;
    filters?: any[][];
    persistentFilters?: any[][];
    objects?: any[];
    aggregations?: any;
    stats?: string;
    reqId?: number;
}
export interface IParametronApi {
    clear(attribute?: string, method?: string): Promise<any>;
    get(attribute?: string, method?: string): any;
    getValues(attribute: string): any;
    set(attribute: '_', method: 'q', search: string): Promise<any>;
    set(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number): Promise<any>;
    set(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): Promise<any>;
    set(attribute: string, method: 'range', start: number, end: number): Promise<any>;
    set(attribute: string, method: 'exist' | 'not_exist'): Promise<any>;
    setPersistent(attribute: '_', method: 'q', search: string): Promise<any>;
    setPersistent(attribute: string, method: 'match' | 'eq' | 'ne', value: string | number): Promise<any>;
    setPersistent(attribute: string, method: 'in' | 'not_in', values: Array<string | number> | string | number): Promise<any>;
    setPersistent(attribute: string, method: 'range', start: number, end: number): any;
    setPersistent(attribute: string, method: 'exist' | 'not_exist'): any;
    fire(): Promise<any>;
    pristine(): boolean;
    params(params: any): Promise<any>;
    fetch(attribute: string, method: string): any;
}
export interface IParametron {
    readonly data: IParametronData;
    api: IParametronApi;
    opts?: IParametronOpts;
}
export declare function createParametron(opts: IParametronOpts, config: IConfig): IParametron;
export declare class Parametron {
    data: IParametronData;
    opts: IParametronOpts;
    private pact;
    private chipmunk;
    constructor(opts: IParametronOpts, config: IConfig);
    getValues(attribute: string): any;
    clear(attribute?: string, method?: string): void;
    get(attribute?: string, method?: string): any[];
    fetch(attribute: string, method: string): {};
    pristine(): boolean;
    set(attribute: string, method: string, value1?: any, value2?: any): void;
    setPersistent(attribute: string, method: string, value1?: any, value2?: any): void;
    /**
     * allow modifying params in any way you like
     */
    params(params: any): any;
    prepare(): void;
    fire(): Promise<IParametronData>;
}
