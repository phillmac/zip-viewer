var currentZip = null;
var rowCounts = [];
var bottomBarDefaultPos = null, bottomBarDisplayStyle = null;
var errorBox = $("#error");

var showFileClickExplanation = true;
var lastShownFile = null;

$.urlParam = function(name){
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results==null){
        return null;
    }
    else{
        return results[1] || 0;
    }
};

var fileReaderOpts = {
    readAsDefault: "ArrayBuffer", on: {
        load: function (e, file) {
            loadZip(file);
        }
    }
};

var selectFormatter = function (item) {
    var index = item.text.indexOf("(");
    if (index > -1) {
        var name = item.text.substring(0, index);
        return name + '<span style="color:#ccc">' + item.text.substring(index - 1) + "</span>";
    } else {
        return item.text;
    }
};

var windowResize = function () {
    positionFooter();
    var container = $("#main-container");
    var cleft = container.offset().left + container.outerWidth();
    $("#bottom-bar").css("left", cleft);
};

var positionFooter = function () {
    var footer = $("#bottom-bar");
    var pager = footer.find("#pager");
    var container = $("#main-container");
    var containerHeight = container.height();
    var footerTop = ($(window).scrollTop()+$(window).height());

    if (bottomBarDefaultPos === null) {
        bottomBarDefaultPos = footer.css("position");
    }

    if (bottomBarDisplayStyle === null) {
        bottomBarDisplayStyle = pager.css("display");
    }

    if (footerTop > containerHeight) {
        footer.css({
            position: "static"
        });
        pager.css("display", "inline-block");
    } else {
        footer.css({
            position: bottomBarDefaultPos
        });
        pager.css("display", bottomBarDisplayStyle);
    }
};

var toggleFullScreen = function () {
    var container = $("#main-container");
    var resizerIcon = $("#resizer i");

    container.toggleClass('container container-fluid');
    resizerIcon.toggleClass('glyphicon-resize-full glyphicon-resize-small');
}
$('#resizer').click(toggleFullScreen);

if (typeof FileReader === "undefined") {
    $('#dropzone, #dropzone-dialog').hide();
    $('#compat-error').show();
} else {
    $('#dropzone, #dropzone-dialog').fileReaderJS(fileReaderOpts);
}

//Update pager position
$(window).resize(windowResize).scroll(positionFooter);
windowResize();

$(".no-propagate").on("click", function (el) { el.stopPropagation(); });

//Check url to load remote DB
var loadUrlDB = $.urlParam('url');
if (loadUrlDB != null) {
    setIsLoading(true);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', loadUrlDB, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = function(e) {
        loadDB(this.response);
    };
    xhr.onerror = function (e) {
        setIsLoading(false);
    };
    xhr.send();
}

function loadZip(file) {
    setIsLoading(true);

    resetTableList();

    setTimeout(function () {
        JSZip.loadAsync(file).then(function(zip) {
            currentZip = zip;

            var firstFolderName = null;
            var tableList = $("#tables");

            var rootFileCount = getFilesForRoot(zip).length;
            if (rootFileCount > 0) {
                rowCounts['/'] = rootFileCount;
                firstFolderName = '/';
            }

            zip.forEach(function (relativePath, zipEntry) {
                if (!zipEntry.dir) {
                  return;
                }

                var name = zipEntry.name;

                if (firstFolderName === null) {
                    firstFolderName = name;
                }

                var rowCount = getFilesForFolder(zip, name).length;
                rowCounts[name] = rowCount;
            });

            for (var rowName in rowCounts) {
              var rowCount = rowCounts[rowName];
              tableList.append('<option value="' + rowName + '">' + rowName + ' (' + rowCount + ' files)</option>');
            }

            //Select first table and show It
            tableList.select2("val", firstFolderName);
            renderQuery(firstFolderName);

            $("#output-box").fadeIn();
            $(".nouploadinfo").hide();
            $("#sample-db-link").hide();
            $("#dropzone").delay(50).animate({height: 50}, 500);
            $("#success-box").show();

            setIsLoading(false);
        }, function (ex) {
            setIsLoading(false);
            alert(ex);
        });
    }, 50);
}

function resetTableList() {
    var tables = $("#tables");
    rowCounts = [];
    tables.empty();
    tables.append("<option></option>");
    tables.select2({
        placeholder: "Select a table",
        formatSelection: selectFormatter,
        formatResult: selectFormatter
    });
    tables.on("change", function (e) {
        renderQuery(e.val);
    });
}

function setIsLoading(isLoading) {
    var dropText = $("#drop-text");
    var loading = $("#drop-loading");
    if (isLoading) {
        dropText.hide();
        loading.show();
    } else {
        dropText.show();
        loading.hide();
    }
}

function extractFileNameWithoutExt(filename) {
    var dotIndex = filename.lastIndexOf(".");
    if (dotIndex > -1) {
        return filename.substr(0, dotIndex);
    } else {
        return filename;
    }
}

function dropzoneClick() {
    $("#dropzone-dialog").click();
}

function showError(msg) {
    $("#data").hide();
    $("#bottom-bar").hide();
    errorBox.show();
    errorBox.text(msg);
}

function renderQuery(folder) {
    var dataBox = $("#data");
    var thead = dataBox.find("thead").find("tr");
    var tbody = dataBox.find("tbody");

    thead.empty();
    tbody.empty();
    errorBox.hide();
    dataBox.show();

    var columnNames = ["Name", "Date", "Comment", "Permissions (DOS / UNIX)"];

    var files;
    if (folder === '/') {
        files = getFilesForRoot(currentZip);
    } else {
        files = getFilesForFolder(currentZip, folder);
    }

    var addedColums = false;
    for (var fileName in files) {
        var file = files[fileName];
        if (file.dir) {
          continue;
        }

        if (!addedColums) {
            addedColums = true;
            for (var i = 0; i < columnNames.length; i++) {
                var columnName = columnNames[i];
                thead.append('<th><span data-toggle="tooltip" data-placement="top" title="' + columnName + '">' + columnName + "</span></th>");
            }
        }

        var columnValues = [];
        columnValues.push(file.name.replace(folder, ''));
        columnValues.push(file.date);
        columnValues.push(file.column);
        columnValues.push(file.dosPermissions + ' / ' + file.unixPermissions);

        var tr = $('<tr>');
        for (var i = 0; i < columnValues.length; i++) {
            var columnValue = columnValues[i];
            var fileElement = tr.append('<td><span title="' + columnValue + '">' + columnValue + '</span></td>');
            registerFileClickListener(file, fileElement);
        }
        tbody.append(tr);
    }

    $('[data-toggle="tooltip"]').tooltip({html: true});

    setTimeout(function () {
        positionFooter();
    }, 100);
}

function registerFileClickListener(file, element) {
    element.click(function() {
        if (showFileClickExplanation) {
          showFileClickExplanation = false;

          window.alert("open console to inspect the content of this file");

          console.log('right click object in console and "Store as global variable". afterwards do something like "temp1.async(\'string\').then(console.log)"');
          console.log('more information here: https://stuk.github.io/jszip/documentation/api_zipobject/async.html');
          console.log('for example: "temp1.async(\'base64\').then(function (content) { window.open(\'data:;base64,\' + content)})"');
        }

        if (lastShownFile === file) {
          return;
        }
        lastShownFile = file;

        console.log(file);
    });
}

function getFilesForRoot(zip) {
    return zip.filter(function(relativePath, file) {
      return relativePath.indexOf('/') < 0;
    });
}

function getFilesForFolder(zip, folder) {
    return zip.folder(folder).filter(function(relativePath, file) {
      return relativePath.replace(folder, '').indexOf('/') < 0;
    });
}
