export type PrivateExamDraft={key:string;pass_percent:75;questions:{prompt:string;options:string[];correct_option:number}[];rationales:string[];unit_count:number};
export const PRIVATE_EXAM_MAX_BYTES:number;
export function parsePrivateExamFile(raw:string):PrivateExamDraft;
