import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferCategoryFromIfcType, looksLikeIfcStepPhysicalFile } from "./ifcImport.ts";

describe("ifcImport helpers", () => {
  it("looksLikeIfcStepPhysicalFile accepts IFC STEP header", () => {
    const buf = Buffer.from(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('x','2024',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT($,$,$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
`);
    assert.equal(looksLikeIfcStepPhysicalFile(buf), true);
  });

  it("looksLikeIfcStepPhysicalFile rejects random bytes", () => {
    assert.equal(looksLikeIfcStepPhysicalFile(Buffer.from("hello world")), false);
  });

  it("inferCategoryFromIfcType maps structural families", () => {
    assert.equal(inferCategoryFromIfcType("IFCWALLSTANDARDCASE"), "concrete");
    assert.equal(inferCategoryFromIfcType("IFCBEAM"), "steel");
    assert.equal(inferCategoryFromIfcType("IFCWINDOW"), "glass");
    assert.equal(inferCategoryFromIfcType("IFCBUILDINGELEMENTPROXY"), "other");
  });
});
