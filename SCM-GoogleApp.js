function doPost(e) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);

    const lastRow = sheet.getLastRow();
    let existingSignatures = new Set();

    // 1. Load existing rows to prevent duplicates
    // Signature: Date + Action + Item Name + Price
    if (lastRow > 1) {
        const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
        values.forEach(row => {
            existingSignatures.add(row[0] + "|" + row[1] + "|" + row[3] + "|" + row[4]);
        });
    }

    const newRows = [];

    // 2. Process Data (Steam Market shows Newest first, we reverse to Oldest -> Newest)
    data.reverse().forEach(txn => {
        // Create a unique signature
        const signature = txn.date + "|" + txn.action + "|" + txn.item + "|" + txn.price;

        if (!existingSignatures.has(signature)) {
            newRows.push([
                txn.date,
                txn.action,
                txn.game,
                txn.item, // This will now include (Sheen: Team Shine), etc.
                txn.price
            ]);
            existingSignatures.add(signature);
        }
    });

    // 3. Save
    if (newRows.length > 0) {
        sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
        return ContentService.createTextOutput(JSON.stringify({result: "success", added: newRows.length}));
    } else {
        return ContentService.createTextOutput(JSON.stringify({result: "success", added: 0}));
    }
}