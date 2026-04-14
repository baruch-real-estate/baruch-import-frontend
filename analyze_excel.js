
const XLSX = require('xlsx');
const path = require('path');

const filePath = '/Users/hosorio/Documents/baruch-import-main/properties test file.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    console.log('Sheets found:', sheetNames);

    sheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref']);

        // Get headers (first row)
        const headers = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = { r: range.s.r, c: C }; // First row
            const cellRef = XLSX.utils.encode_cell(cellAddress);
            const cell = sheet[cellRef];
            if (cell && cell.v) {
                headers.push(cell.v);
            }
        }

        console.log(`\nSheet: "${sheetName}"`);
        console.log('Headers:', headers);

        // Get first row of data to see sample values
        if (range.e.r > range.s.r) {
            const firstDataRow = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = { r: range.s.r + 1, c: C }; // Second row
                const cellRef = XLSX.utils.encode_cell(cellAddress);
                const cell = sheet[cellRef];
                firstDataRow.push(cell ? cell.v : null);
            }
            console.log('Sample Row 1:', firstDataRow);
        }
    });

} catch (error) {
    console.error('Error reading file:', error);
}
