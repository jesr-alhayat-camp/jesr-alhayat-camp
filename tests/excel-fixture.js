const mockRecords = {};
const snap = (v) => ({ val: () => v ?? null, exists: () => v != null });
const db = {
  ref(path) {
    return {
      on() {},
      off() {},
      set: async (v) => {
        mockRecords[path] = v;
      },
      push: async (v) => {
        mockRecords[path] = v;
      },
      update: async (v) => Object.assign(mockRecords, v),
      transaction: async (cb) => {
        const v = cb(structuredClone(mockRecords[path] ?? null));
        if (v !== undefined) mockRecords[path] = v;
        return {
          committed: v !== undefined,
          snapshot: snap(mockRecords[path]),
        };
      },
    };
  },
};
const authMock = {
  onAuthStateChanged() {},
  setPersistence: async () => {},
  currentUser: { email: "test@example.invalid" },
};
window.firebase = {
  initializeApp() {},
  auth: Object.assign(() => authMock, {
    Auth: { Persistence: { SESSION: "session", NONE: "none" } },
  }),
  database: () => db,
};
window.confirm = () => true;
window.alert = () => {};
async function verify() {
  const assert = (v, m) => {
      if (!v) throw Error(m);
    },
    el = (id) => document.getElementById(id);
  ROLE = "super_admin";
  synced = true;
  isFirstLoad = false;
  assert(el("imp_stock") && el("imp_vulnerable"), "missing import buttons");
  const head = Array(43).fill("");
  Object.assign(head, {
    0: "G",
    1: "أسرة اختبار",
    2: "011111111",
    4: "2020-02-29",
    5: "0590000000",
    26: "٣",
    40: "G0042",
    41: "1",
    42: true,
  });
  const fixtures = {
    families: head,
    aids: ["أسرة اختبار", "011111111", "G", "طحين", "[2026-01-01] تجربة", "٢"],
    children: [
      "طفل",
      "022222222",
      "2015-03-16",
      "ذكر",
      "أب",
      "011111111",
      "0590000000",
      "أم",
      "033333333",
      "نص",
    ],
    injured: [
      "مصاب",
      "022222222",
      "2015-03-16",
      "قدم",
      "0590000000",
      "نص",
      "نعم",
      "011111111",
    ],
    orphans: [
      "يتيم",
      "022222222",
      "2015-03-16",
      "وصي",
      "033333333",
      "2022-06-01",
      "شهيد",
      "044444444",
      "0590000000",
      "011111111",
    ],
    chronic: [
      "مريض",
      "022222222",
      "2015-03-16",
      "ذكر",
      "ضغط",
      "دواء",
      "0590000000",
    ],
    stock: ["2026-06-01", "وارد", "طحين", "٢", "كيس", "جهة", "نص"],
  };
  assert(await loadExcel(), "تحميل مكتبة Excel");
  let bytes, book;
  XLSX.writeFile = (w) => {
    bytes = XLSX.write(w, { type: "array", bookType: "xlsx" });
    book = XLSX.read(bytes, { type: "array", cellDates: true, cellNF: true });
  };
  window.alert = (m) => {
    throw Error(m);
  };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
  async function capture(button) {
    bytes = null;
    button.click();
    for (let i = 0; i < 30 && !bytes; i++) await pause();
    assert(bytes, "no download " + button.outerHTML);
    return book.Sheets[book.SheetNames[0]];
  }
  async function upload(input, dbKey, accept) {
    const button = Array.from(
      document.querySelectorAll("button[onclick]"),
    ).find((b) => b.getAttribute("onclick").includes("'" + input.id + "'"));
    assert(button, "no import button " + input.id);
    let opened = false;
    input.click = () => {
      opened = true;
    };
    button.click();
    assert(opened, "picker " + input.id);
    const file = new File([bytes], "test.xlsx"),
      dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change"));
    for (let i = 0; i < 50 && !accept(mockRecords[dbKey]); i++) await pause();
    assert(accept(mockRecords[dbKey]), "import " + input.id);
  }
  for (const [kind, row] of Object.entries(fixtures)) {
    const key = "db_" + kind,
      id = kind + "Table";
    localDB[key] = [row];
    mockRecords[key] = [row];
    loadTable(key, id, EXPORT_SCHEMAS[key].length);
    const ws = await capture(
      document.querySelector(
        'button[onclick*="exportExcel"][onclick*="' + id + '"]',
      ),
    );
    assert(ws.B1.t === "s", "text heading");
    const data = readWorkbookRows(ws),
      h = data[0],
      r = data[1];
    assert(r, "empty " + kind);
    if (kind === "families") {
      assert(
        ws[XLSX.utils.encode_cell({ r: 1, c: h.indexOf("رقم الجوال") })].t ===
          "n" && r[h.indexOf("رقم الجوال")] === "0590000000",
        "phone",
      );
      assert(r[h.indexOf("تاريخ الميلاد")] instanceof Date, "date");
      assert(r[h.indexOf("العدد الكلي للأفراد")] === 3, "number");
    }
    localDB[key] = [];
    mockRecords[key] = [];
    await upload(el("imp_" + kind), key, (rows) => rows?.length === 1);
    const actual = mockRecords[key][0];
    for (let j = 0; j < row.length; j++) {
      if (kind === "families" && j === 42) continue;
      const expected = DATE_FIELDS[key]?.includes(j)
        ? formatDateValue(row[j])
        : toLatin(row[j]);
      assert(
        toLatin(actual[j]) === expected,
        kind + " column " + j + " = " + actual[j] + " expected " + expected,
      );
    }
  }
  for (const [side, type] of [
    ["in", "وارد - مساهمة"],
    ["out", "صادر - شراء"],
  ]) {
    const key = "db_fund",
      id = side === "in" ? "fundInTable" : "fundOutTable";
    localDB[key] = [["2026-05-01", type, "125.50", "جهة", "نص"]];
    loadFundTables();
    await capture(
      document.querySelector(
        'button[onclick*="exportExcel"][onclick*="' + id + '"]',
      ),
    );
    mockRecords[key] = [];
    localDB[key] = [];
    await upload(el("imp_fund_" + side), key, (rows) => rows?.length === 1);
    assert(
      mockRecords[key][0][1] === type &&
        Number(mockRecords[key][0][2]) === 125.5,
      "fund",
    );
  }
  localDB.db_families = [head];
  mockRecords.db_families = [head];
  await capture(el("export_vulnerable"));
  mockRecords.db_families = [head.slice(0, 42)];
  await upload(
    el("imp_vulnerable"),
    "db_families",
    (rows) => rows?.[0]?.[42] === true,
  );

  const byHandler = (handler) =>
    document.querySelector('button[onclick*="' + handler + '"]');
  localDB.db_fund = [
    ["2026-05-01", "وارد - مساهمة", "125.50", "أسرة اختبار", "نص"],
  ];
  loadSubscribers();
  await capture(byHandler("subscribersTable"));
  await capture(byHandler("exportPayments"));
  mockRecords.db_fund = [];
  await upload(
    el("imp_payments"),
    "db_fund",
    (rows) => rows?.[0]?.[1] === "وارد - مساهمة",
  );
  loadTable("db_families", "familiesTable", 40);
  await capture(byHandler("exportFilteredExcel"));
  auditLoaded = true;
  localDB.db_audit = {
    one: { t: Date.now(), u: "user", a: "اختبار", d: "نص" },
  };
  const auditSheet = await capture(byHandler("exportAudit"));
  assert(auditSheet.A2.t === "d", "audit timestamp");
  openCodesTool();
  await capture(byHandler("codesExport"));
  closeModal();
  drillStock(0);
  if (!byHandler("drExport")) {
    window.__stockOrder = ["طحين"];
    drillStock(0);
  }
  await capture(byHandler("drExport"));
  closeModal();
  for (const key of Object.keys(REPS)) {
    el("rp_type").value = key;
    await capture(byHandler("repExcel"));
    assert(book.SheetNames.length > 1, "report " + key);
  }

  loadQuality();
  for (const button of document.querySelectorAll('button[onclick^="qExport("]'))
    await capture(button);
  const other = head.slice();
  other[1] = "أسرة ثانية";
  other[2] = "055555555";
  other[40] = "G0043";
  localDB.db_families = [head, other];
  loadTable("db_families", "familiesTable", 40);
  el("famSearch").value = "G0043";
  filterFamilies();
  const filtered = await capture(byHandler("exportFilteredExcel"));
  assert(
    readWorkbookRows(filtered).length === 2 &&
      readWorkbookRows(filtered)[1].includes("G0043"),
    "filtered family",
  );
}
window.addEventListener("DOMContentLoaded", async () => {
  try {
    await verify();
    document.body.dataset.testResult = "PASS";
  } catch (error) {
    document.body.dataset.testResult = String(error.stack || error);
  }
});
