/**
 * Adobe Illustrator Automation & ExtendScript Generation Engine
 * Controls Adobe Illustrator via OLE/COM and ExtendScript (.jsx) on Windows.
 * Opens SVGs one by one, embeds XMP metadata, exports EPS 10 and companion JPEG.
 */

import { MetadataItem } from '../types';

export interface IllustratorBatchItem {
  filename: string;
  svgPath: string;
  epsPath: string;
  jpgPath: string;
  title: string;
  keywords: string;
  description: string;
  category: string;
  rating: number;
}

/**
 * Escapes characters for ExtendScript JavaScript string literals
 */
function escapeJsString(str: string): string {
  return (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Generates an Adobe Illustrator ExtendScript (.jsx) file content
 */
export function generateIllustratorExtendScript(
  items: IllustratorBatchItem[],
  progressLogPath: string
): string {
  const itemsJson = JSON.stringify(items, null, 2);

  return `// Adobe Illustrator Batch Vector & Metadata Processor
#target illustrator

(function() {
    var items = ${itemsJson};
    var progressFile = new File("${escapeJsString(progressLogPath)}");

    function reportProgress(index, total, name, status, err) {
        try {
            progressFile.open("w");
            var info = {
                current: index,
                total: total,
                filename: name,
                status: status,
                error: err || ""
            };
            progressFile.write(JSON.stringify(info));
            progressFile.close();
        } catch(e) {}
    }

    try {
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    } catch(e) {}

    // Load AdobeXMPScript library for native metadata embedding
    var xmpLoaded = false;
    try {
        if (ExternalObject.AdobeXMPScript == undefined) {
            ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
        }
        xmpLoaded = (ExternalObject.AdobeXMPScript != undefined);
    } catch(e) {
        xmpLoaded = false;
    }

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        reportProgress(i + 1, items.length, item.filename, "opening");

        var svgFile = new File(item.svgPath);
        if (!svgFile.exists) {
            reportProgress(i + 1, items.length, item.filename, "error", "SVG file not found on disk");
            continue;
        }

        var doc = null;
        try {
            // 1. Open SVG file in Illustrator
            doc = app.open(svgFile);

            // 2. Inject XMP Metadata directly into document
            if (xmpLoaded && doc) {
                try {
                    var xmp = new XMPMeta(doc.XMPString);
                    // Title
                    xmp.deleteProperty(XMPConst.NS_DC, "title");
                    xmp.appendArrayItem(XMPConst.NS_DC, "title", item.title, 0, XMPConst.PROP_IS_ARRAY);

                    // Description / Caption
                    xmp.deleteProperty(XMPConst.NS_DC, "description");
                    xmp.appendArrayItem(XMPConst.NS_DC, "description", item.description || item.title, 0, XMPConst.PROP_IS_ARRAY);

                    // Keywords (Dublin Core subject bag)
                    xmp.deleteProperty(XMPConst.NS_DC, "subject");
                    var tags = item.keywords.split(",");
                    for (var t = 0; t < tags.length; t++) {
                        var tag = tags[t].replace(/^\\s+|\\s+$/g, "");
                        if (tag.length > 0) {
                            xmp.appendArrayItem(XMPConst.NS_DC, "subject", tag, 0, XMPConst.PROP_IS_ARRAY);
                        }
                    }

                    // Category & Rating
                    xmp.setProperty(XMPConst.NS_PHOTOSHOP, "Category", item.category || "Arts, Objects");
                    xmp.setProperty(XMPConst.NS_XMP, "Rating", String(item.rating || 5));

                    doc.XMPString = xmp.serialize();
                } catch(xmpErr) {}
            }

            // 3. Save as EPS 10 (Microstock compatible)
            reportProgress(i + 1, items.length, item.filename, "saving_eps");
            var epsFile = new File(item.epsPath);
            var epsOptions = new EPSSaveOptions();
            epsOptions.compatibility = Compatibility.ILLUSTRATOR10; // EPS 10!
            epsOptions.embedAllFonts = true;
            epsOptions.embedLinkedFiles = true;
            epsOptions.includeDocumentThumbnails = true;
            epsOptions.cmykPostScript = false;
            doc.saveAs(epsFile, epsOptions);

            // 4. Export high-resolution companion JPEG using Artboard at 72 ppi
            reportProgress(i + 1, items.length, item.filename, "exporting_jpg");
            var jpgFile = new File(item.jpgPath);
            var exportOptions = new ExportOptionsJPEG();
            exportOptions.antiAliasing = true;
            exportOptions.qualitySetting = 100;
            exportOptions.optimization = true;
            exportOptions.artBoardClipping = true; // Use Artboards option selected
            exportOptions.horizontalScale = 100.0; // 72 ppi (1:1 artboard dimensions)
            exportOptions.verticalScale = 100.0;
            if (doc.artboards.length > 0) {
                doc.artboards.setActiveArtboardIndex(0);
            }
            doc.exportFile(jpgFile, ExportType.JPEG, exportOptions);

            // 5. Close document without saving changes to original SVG
            doc.close(SaveOptions.DONOTSAVECHANGES);
            doc = null;

            reportProgress(i + 1, items.length, item.filename, "completed");
        } catch(docErr) {
            if (doc != null) {
                try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(closeErr) {}
            }
            reportProgress(i + 1, items.length, item.filename, "error", docErr.toString());
        }
    }

    reportProgress(items.length, items.length, "All files", "all_completed");
})();
`;
}

/**
 * Builds the Windows VBScript to trigger Illustrator via OLE/COM
 */
export function generateIllustratorVbScript(jsxPath: string): string {
  return `' VBScript automation runner for Adobe Illustrator
On Error Resume Next

Set appRef = CreateObject("Illustrator.Application")
If Err.Number <> 0 Then
    WScript.Echo "ERROR: Adobe Illustrator is not installed or could not be launched."
    WScript.Quit 1
End If

appRef.UserInteractionLevel = -1 ' aiDontDisplayAlerts
appRef.DoJavaScriptFile "${escapeJsString(jsxPath)}"

If Err.Number <> 0 Then
    WScript.Echo "ERROR: " & Err.Description
    WScript.Quit 1
End If

WScript.Echo "SUCCESS"
WScript.Quit 0
`;
}
