import { RequestPerformer } from './types';
declare class FetchRequestPerformer implements RequestPerformer<Request, Response> {
    readonly performRequest: typeof globalThis.fetch;
}
export default FetchRequestPerformer;
