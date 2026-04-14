
import * as XLSX from 'xlsx';
import type { ExcelPropertyRow, ExcelUnitRow } from './types';

export interface ParsedData {
    properties: {
        [locale: string]: ExcelPropertyRow[];
    };
    units: ExcelUnitRow[];
}

export class ExcelParser {
    static async parse(file: File): Promise<ParsedData> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });

                    const result: ParsedData = {
                        properties: {},
                        units: []
                    };

                    workbook.SheetNames.forEach(sheetName => {
                        const sheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(sheet);

                        if (sheetName.startsWith('single-')) {
                            // Extract locale from sheet name (e.g., "single-en" -> "en")
                            const locale = sheetName.replace('single-', '');
                            result.properties[locale] = jsonData as ExcelPropertyRow[];
                        } else if (sheetName === 'single') {
                            // "single" indicates base locale "en"
                            result.properties['en'] = jsonData as ExcelPropertyRow[];
                        } else if (sheetName === 'units') {
                            result.units = jsonData as ExcelUnitRow[];
                        }
                        // Ignore other sheets
                    });

                    // Ensure 'en' exists or at least one property sheet
                    if (Object.keys(result.properties).length === 0) {
                        reject(new Error('No property sheets found (expected sheets starting with "single-")'));
                        return;
                    }

                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsBinaryString(file);
        });
    }
}
