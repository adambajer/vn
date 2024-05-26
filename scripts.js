document.addEventListener('DOMContentLoaded', async function () {
    setUpUserTooltip();
    initializeFontSettings();
    loadFontPreference();
    observeNoteContainerChanges();
    const urlParams = new URLSearchParams(window.location.search);
    const spaceToken = urlParams.get('spaceToken');

    if (spaceToken) {
        console.log("spaceToken: " + spaceToken);
        accessOrCreateContentBySpaceToken(spaceToken);
    } else {
        console.log("No specific token found, loading default notebooks...");
        accessOrCreateContentBySpaceToken(); // Function name updated to handle both cases
    }
    setUpNoteInput();
    toggleSpeechKITT();
});

async function accessOrCreateContentBySpaceToken(spaceToken = null) {
    if (spaceToken) {
        console.log("Accessing content with spaceToken:", spaceToken);
        const notebookId = await getNotebookIdByToken(spaceToken);
        if (notebookId) {
            loadSingleNotebook(notebookId);
        } else {
            console.error("Invalid spaceToken. No notebook found.");
        }
    } else {
        console.log("No spaceToken provided. Loading user notebooks...");
        await loadUserNotebooks();
    }
}


async function loadUserNotebooks() {
    const userId = localStorage.getItem('userId');
    const userNotebooksRef = firebase.database().ref(`users/${userId}/notebooks`);
    let snapshot = await userNotebooksRef.once('value');
    const userNotebooks = snapshot.val() || {};

    const notebooksRef = firebase.database().ref(`notebooks`);
    let notebooksSnapshot = await notebooksRef.once('value');
    const notebooks = notebooksSnapshot.val() || {};

    if (Object.keys(userNotebooks).length === 0) {
        console.log("No notebooks found, creating one...");
        createNotebook(userId);
    } else {
        let activeTabUID = await getActiveTabUID();
        let foundActiveTab = false;

        Object.keys(userNotebooks).forEach((notebookId, index) => {
            if (notebooks[notebookId]) {
                let notebookData = notebooks[notebookId];
                let shouldSetActive = notebookId === activeTabUID || (!foundActiveTab && index === 0 && !activeTabUID);
                createTab(notebookId, shouldSetActive, notebookData.notes ? Object.keys(notebookData.notes).length : 0, notebookData.name);
                if (shouldSetActive) foundActiveTab = true;
            }
        });

        if (!foundActiveTab && activeTabUID) {
            console.log("Stored active tab ID not found among current notebooks.");
            setFirstTabActive();
        }
    }
}
async function getNotebookIdByToken(token) {
    const notebooksRef = firebase.database().ref(`notebooks`);
    let snapshot = await notebooksRef.once('value');
    const notebooks = snapshot.val() || {};

    for (let notebookId in notebooks) {
        if (notebooks[notebookId].token === token) {
            return notebookId;
        }
    }
    return null;
}

async function createTab(notebookId, setActive = false, noteCount = 0, notebookName = "") {
    var tab = document.createElement('li');
    tab.className = 'nav-item d-inline-flex justify-content-between';

    var link = document.createElement('a');
    link.className = 'nav-link';
    link.href = '#';
    link.dataset.notebookId = notebookId;
    link.setAttribute('title', notebookId);

    var img = document.createElement('img');
    img.src = "note.svg";
    img.alt = "Note Icon";
    img.className = 'ms-2';
    img.style.width = "24px";
    img.style.height = "24px";

    var nameLabel = document.createElement('span');
    nameLabel.className = 'notebook-name m-2';
    nameLabel.textContent = notebookName;

    var badge = document.createElement('span');
    badge.className = 'badge bg-primary m-2';
    badge.textContent = noteCount;

    var dropdownBtn = document.createElement('button');
    dropdownBtn.className = 'btn';
    dropdownBtn.setAttribute('data-bs-toggle', 'dropdown');
    dropdownBtn.ariaExpanded = false;
    dropdownBtn.innerHTML = '⋮';

    var dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'dropdown-menu';
    dropdownMenu.appendChild(createDropdownItem('Rename', () => promptRenameNotebook(notebookId, nameLabel)));
    dropdownMenu.appendChild(createDropdownItem('Share Notebook', () => shareNotebook(notebookId))); // Added share functionality
    dropdownMenu.appendChild(createDropdownItem('Share Note', () => shareNotePrompt(notebookId))); // Added share note functionality
    dropdownMenu.appendChild(createDropdownItem('Duplicate', () => copyNotebook(notebookId)));
    dropdownMenu.appendChild(createDropdownItem('Download as TXT', () => downloadNotebookAsText(notebookId)));
    dropdownMenu.appendChild(createDropdownItem('Delete', () => deleteNotebook(notebookId)));

    link.appendChild(img);
    link.appendChild(nameLabel);
    link.appendChild(badge);
    link.appendChild(dropdownBtn);
    link.appendChild(dropdownMenu);
    tab.appendChild(link);

    link.onclick = function (event) {
        event.preventDefault();
        document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        loadNotes(notebookId);
        saveActiveTabUID(notebookId);
    };

    document.getElementById('notebookTabs').appendChild(tab);

    if (setActive) {
        link.click();
    }

    return { badge: badge, nameLabel: nameLabel };
}
function setUpUserTooltip() {
    const userId = document.getElementById('userId');
    userId.innerHTML = `${localStorage.getItem('userId')}`;
    const userIcon = document.getElementById('userIcon');
    const tooltip = document.getElementById('userTooltip');

    if (!userIcon || !tooltip) {
        console.error("Tooltip or User Icon not found in the document.");
        return;  // Ensures elements are present before adding event listeners
    }

    userIcon.addEventListener('mouseover', function () {
        var deviceInfo = getDeviceInfo();
        var infoText = "";  // Initialize an empty string to hold the information.
        infoText = '<div class="ones">UserId</div>' + '<div class="twos">' + localStorage.getItem('userId') + '</div>';
        infoText = infoText + '<div class="ones">ActiveTabUID</div>' + '<div class="twos">' + localStorage.getItem('activeTabUID') + '</div>';
        // Iterate over each property in the deviceInfo object
        for (var key in deviceInfo) {
            if (deviceInfo.hasOwnProperty(key)) {  // Make sure the property isn't from the prototype chain
                infoText += '<div class="ones">' + key + '</div><div class="twos">' + deviceInfo[key] + '</div>';
            }
        }

        tooltip.innerHTML = infoText;  // Set the inner HTML of the tooltip to the compiled string
        tooltip.style.display = 'block';  // Make sure to show the tooltip when hovering
    });

    userIcon.addEventListener('mouseout', function () {
        tooltip.style.display = 'none';  // Hide the tooltip
    });
}

function setUpNoteInput() {
    const noteInput = document.getElementById('noteInput');
    noteInput.addEventListener('keydown', function (event) {
        if (event.key === "Enter") {
            addNoteFromInput();
            event.preventDefault();
        }
    });
    noteInput.addEventListener('blur', addNoteFromInput);
    document.getElementById('createNotebookButton').addEventListener('click', () => createNotebook(localStorage.getItem('userId')));
}


function setFirstTabActive() {
    let firstTabLink = document.querySelector('.nav-link');
    if (firstTabLink) {
        firstTabLink.click();
    }
}

function loadSingleNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.once('value', snapshot => {
        if (snapshot.exists()) {
            const notebookData = snapshot.val();
            console.log("Notebook data loaded:", notebookData);
            // Further processing such as displaying notebook data in the UI
        } else {
            console.log("Notebook not found.");
        }
    });
}

const baseUrl = '';  // Replace this with the actual base URL of your application




function getTokenForNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}/token`);
    return new Promise((resolve, reject) => {
        notebookRef.once('value', snapshot => {
            if (snapshot.exists()) {
                resolve(snapshot.val()); // Token already exists, use it
            } else {
                // Token does not exist, generate a new one and save it
                const newToken = btoa(Math.random()).substring(0, 12); // Simple token generation
                notebookRef.set(newToken, error => {
                    if (error) {
                        reject(error);  // Handle possible write error
                    } else {
                        resolve(newToken);  // Resolve with the new token after saving
                    }
                });
            }
        });
    });
}

async function getNotebookIdByToken(token) {
    const notebooksRef = firebase.database().ref(`notebooks`);
    let snapshot = await notebooksRef.once('value');
    const notebooks = snapshot.val() || {};

    for (let notebookId in notebooks) {
        if (notebooks[notebookId].token === token) {
            return notebookId;
        }
    }
    return null;
}

function setActiveTab(notebookId) {
    const notebookTabs = document.querySelectorAll('.nav-link');
    notebookTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.notebookId === notebookId) {
            tab.classList.add('active');
        }
    });
    saveActiveTabUID(notebookId);
}
document.addEventListener('input', function (event) {
    if (event.target.matches('.note[contenteditable]')) {
        const noteId = event.target.getAttribute('data-note-id');
        const notebookId = document.querySelector('.nav-link.active').dataset.notebookId;
        const newContent = event.target.textContent;
        console.log(event);
        updateNote(notebookId, noteId, newContent);
    }
});

function saveActiveTabUID(uid) {
    localStorage.setItem('activeTabUID', uid);
}


function loadNotes(notebookId) {
    const notebookNotesRef = firebase.database().ref(`notebooks/${notebookId}/notes`);
    notebookNotesRef.on('value', function (snapshot) {
        const notes = snapshot.val() || {};
        document.getElementById('notesContainer').innerHTML = '';
        Object.keys(notes).forEach(noteId => {
            var noteElement = document.createElement('div');
            noteElement.className = 'note';
            noteElement.setAttribute('data-note-id', noteId);

            var noteText = document.createElement('span');
            noteText.textContent = notes[noteId].content;
            noteText.className = 'note-text';
            noteText.contentEditable = !notes[noteId].finished;
            noteText.setAttribute('data-note-id', noteId);
            if (notes[noteId].finished) {
                noteElement.classList.add('finished');
            }

            noteText.addEventListener('blur', function () {
                updateNote(notebookId, noteId, noteText.textContent);
            });

            let createdAt = formatDate(new Date(notes[noteId].createdAt));
            let updatedAt = formatDate(new Date(notes[noteId].updatedAt));
            let tooltipContent = `Created: ${createdAt}`;
            if (createdAt !== updatedAt) {
                tooltipContent += `\nEdited: ${updatedAt}`;
            }
            noteElement.setAttribute('data-title', tooltipContent);

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'note-checkbox';
            checkbox.checked = notes[noteId].finished;
            checkbox.onchange = function () {
                toggleNoteFinished(notebookId, noteId, checkbox.checked);
                noteText.contentEditable = !checkbox.checked;
            };

            var deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'delete-note';
            deleteBtn.onclick = function () {
                deleteNote(notebookId, noteId);
            };

            noteElement.appendChild(checkbox);
            noteElement.appendChild(noteText);
            noteElement.appendChild(deleteBtn);

            document.getElementById('notesContainer').prepend(noteElement);
        });
    });
}



async function getActiveTabUID() {
    return localStorage.getItem('activeTabUID');
}
const firebaseConfig = {
    databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
};

firebase.initializeApp(firebaseConfig);
let userId = sessionStorage.getItem('userId') || generateUserId();

function generateUserId() {
    function getDeviceFingerprint() {
        var navigatorData = window.navigator;
        var screenData = window.screen;
        var fingerprint = [
            navigatorData.platform,
            navigatorData.userAgent.replace(/\d+/g, ""), // Remove digits to minimize version changes
            navigatorData.language,
            screenData.height,
            screenData.width,
            screenData.colorDepth,
            new Date().getTimezoneOffset()
        ].join('|');
        return fingerprint;
    }

    function hashString(str) {
        // Simple hash function for illustration
        var hash = 0, i, chr;
        for (i = 0; i < str.length; i++) {
            chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }

    const fingerprint = getDeviceFingerprint();
    const hashedFingerprint = hashString(fingerprint).toString(16); // Convert to hex
    const shortId = hashedFingerprint.substr(0, 8); // Take first 8 characters

    const storedUserId = localStorage.getItem('userId');
    if (storedUserId === shortId) {
        return storedUserId;
    } else {
        localStorage.setItem('userId', shortId);
        return shortId;
    }
}
function getDeviceInfo() {
    var navigatorData = window.navigator;
    var screenData = window.screen;
    var deviceInfo = {
        platform: navigatorData.platform,
        userAgent: navigatorData.userAgent.replace(/\d+/g, ""), // Remove digits to minimize version changes
        language: navigatorData.language,
        resolution: `${screenData.width} x ${screenData.height}`,
        colorDepth: `${screenData.colorDepth}-bit`,
        timezoneOffset: `UTC ${new Date().getTimezoneOffset() / 60}`
    };
    return deviceInfo;
}

function getNotebookIdFromPath() {
    // Example URL: "https://adambajer.github.io/Voice-Noter/notebooks/-NxLpMKvPUyhOnM50UvE"
    // Splitting by '/' gives us: ["https:", "", "adambajer.github.io", "Voice-Noter", "notebooks", "-NxLpMKvPUyhOnM50UvE"]
    const pathSegments = window.location.pathname.split('/');
    // Notebook ID is expected to be after 'notebooks', adjust the index accordingly.
    const notebookIndex = pathSegments.indexOf('notebooks');
    if (notebookIndex !== -1 && notebookIndex + 1 < pathSegments.length) {
        return pathSegments[notebookIndex + 1];
    }
    return null; // Return null if no notebook ID is found
}
function generateCustomNotebookId() {
    // Generates a random 16-character alphanumeric string
    return [...Array(16)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
}

function addNoteFromInput() {
    const noteContent = document.getElementById('noteInput').value;
    const notebookId = document.querySelector('.nav-link.active')?.dataset.notebookId;
    if (noteContent && notebookId) {
        addNote(noteContent, notebookId);
        document.getElementById('noteInput').value = ''; // Clear the input after adding a note
    }
}


function createNotebook(userId) {
    const newNotebookId = generateCustomNotebookId();
    const newNotebookRef = firebase.database().ref(`notebooks/${newNotebookId}`);

    const notebookData = {
        createdAt: Date.now(),
        token: btoa(Math.random()).substring(0, 12)
    };

    newNotebookRef.set(notebookData, error => {
        if (!error) {
            assignNotebookToUser(userId, newNotebookId);
            createTab(newNotebookId, true);
        } else {
            console.error('Error creating notebook:', error);
        }
    });
}

function assignNotebookToUser(userId, notebookId) {
    const userNotebooksRef = firebase.database().ref(`users/${userId}/notebooks/${notebookId}`);
    userNotebooksRef.set({ id: notebookId }, error => {
        if (error) {
            console.error('Error assigning notebook to user:', error);
        } else {
            console.log('Notebook assigned to user successfully');
        }
    });
}
function assignNotebookToUser(userId, notebookId) {
    const userNotebooksRef = firebase.database().ref(`users/${userId}/notebooks/${notebookId}`);
    userNotebooksRef.set({ id: notebookId }, error => {
        if (error) {
            console.error('Error assigning notebook to user:', error);
        } else {
            console.log('Notebook assigned to user successfully');
        }
    });
}

function promptRenameNotebook(notebookId, nameLabel) {
    const currentName = nameLabel.textContent;
    const newName = prompt("Please enter a new name for the notebook:", currentName);
    if (newName && newName.trim() !== "" && newName !== currentName) {
        renameNotebook(notebookId, newName.trim(), nameLabel);
    }
}

function renameNotebook(notebookId, newName, nameLabel) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.update({ name: newName }).then(() => {
        nameLabel.textContent = newName; // Update the notebook name in the UI
        console.log("Notebook renamed successfully");
    }).catch(error => {
        console.error("Error renaming notebook:", error);
    });
}



function createDropdownItem(text, action) {
    var item = document.createElement('a');
    item.className = 'dropdown-item';
    item.href = '#';
    item.textContent = text;

    // Assign additional class based on the action text
    if (text.toLowerCase() === 'delete') {
        item.classList.add('dropdown-item-delete');
    }

    item.onclick = function (event) {
        event.preventDefault(); // Prevent the link from triggering a page reload
        action();
    };
    return item;
}



function deleteNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.remove()
        .then(() => {
            //alert('Notebook successfully deleted.');
            // Remove the tab from the UI
            removeTab(notebookId);
        })
        .catch(error => {
            console.error('Error deleting notebook:', error);
            alert('Failed to delete notebook: ' + error);
        });
}

function removeTab(notebookId) {
    const tabElement = document.querySelector(`a[data-notebook-id="${notebookId}"]`).parentNode;
    if (tabElement) {
        tabElement.parentNode.removeChild(tabElement);
    }
}


function copyNotebook(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    notebookRef.once('value', snapshot => {
        const data = snapshot.val();
        const newNotebookId = generateCustomNotebookId(); // Assuming you have a function to generate IDs
        const newNotebookRef = firebase.database().ref(`notebooks/${newNotebookId}`);
        newNotebookRef.set(data)
            .then(() => {
                //  alert('Notebook copied successfully, new notebook ID: ' + newNotebookId);
                createTab(newNotebookId, true); // Adding new notebook tab to UI
            })
            .catch(error => {
                alert('Failed to copy notebook: ' + error);
            });
    });
}

function downloadNotebookAsText(notebookId) {
    const notesRef = firebase.database().ref(`users/${userId}/notebooks/${notebookId}/notes`);
    notesRef.once('value', snapshot => {
        const notes = snapshot.val();
        const allNotesText = Object.keys(notes).map(key => notes[key].content).join('\n');
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(allNotesText));
        element.setAttribute('download', `notebook-${notebookId}.txt`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    })
        .catch(err => {
            alert('Error downloading the notebook: ' + err);
        });
}

function addNote(content, notebookId) {
    const newNoteRef = firebase.database().ref(`notebooks/${notebookId}/notes`).push();
    const now = Date.now();
    const noteData = {
        content: content,
        createdAt: now,
        updatedAt: now,
        token: btoa(Math.random()).substring(0, 12) // Generate a token for the note
    };

    newNoteRef.set(noteData, error => {
        if (error) {
            console.error('Failed to add note:', error);
        } else {
            console.log('Note added successfully');
            updateNoteCount(notebookId, 1);
        }
    });
}






function addNote(content, notebookId) {
    const newNoteRef = firebase.database().ref(`notebooks/${notebookId}/notes`).push();
    const now = Date.now();
    const noteData = {
        content: content,
        createdAt: now,
        updatedAt: now,
        token: btoa(Math.random()).substring(0, 12) // Generate a token for the note
    };

    newNoteRef.set(noteData, error => {
        if (error) {
            console.error('Failed to add note:', error);
        } else {
            console.log('Note added successfully');
            updateNoteCount(notebookId, 1);
        }
    });
}
function updateNote(notebookId, noteId, content) {
    var noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.update({
        content: content,
        updatedAt: Date.now()
    }).then(() => {
        console.log('Note updated successfully');
    }).catch(error => {
        console.error('Failed to update note:', error);
    });
}

function updateNoteCount(notebookId, increment) {
    const badge = document.querySelector(`a[data-notebook-id="${notebookId}"] .badge`);
    let count = parseInt(badge.textContent) || 0;
    badge.textContent = count + increment;
}

function deleteNote(notebookId, noteId) {
    var noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.remove()
        .then(() => {
            console.log('Note deleted successfully');
            var noteElement = document.querySelector(`div[data-note-id="${noteId}"]`);
            if (noteElement) {
                noteElement.parentNode.removeChild(noteElement);
            }
            updateNoteCount(notebookId, -1); // Decrement the note count
        })
        .catch(error => {
            console.error('Failed to delete note:', error);
        });
}


function toggleNoteFinished(notebookId, noteId, isFinished) {
    var noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.update({
        finished: isFinished
    }, error => {
        if (error) {
            console.error('Failed to update note:', error);
        } else {
            console.log('Note updated successfully');
            var noteElement = document.querySelector(`div[data-note-id="${noteId}"]`);
            if (isFinished) {
                noteElement.classList.add('finished');
                noteElement.contentEditable = false;
            } else {
                noteElement.classList.remove('finished');
                noteElement.contentEditable = true;
            }
        }
    });
}


function formatDate(date) {
    let day = date.getDate().toString().padStart(2, '0');
    let month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months start at 0!
    let year = date.getFullYear();
    let hours = date.getHours().toString().padStart(2, '0');
    let minutes = date.getMinutes().toString().padStart(2, '0');
    let seconds = date.getSeconds().toString().padStart(2, '0'); // Include seconds

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}



function toggleSpeechKITT() {
    if (typeof annyang === 'undefined' || typeof SpeechKITT === 'undefined') {
        console.error("Annyang or SpeechKITT is not loaded!");
        return;
    }

    // Initialize SpeechKITT settings once
    SpeechKITT.annyang();
    annyang.setLanguage('cs'); // Set the desired language

    SpeechKITT.setStylesheet('https://cdnjs.cloudflare.com/ajax/libs/SpeechKITT/1.0.0/themes/flat.css');
    SpeechKITT.setInstructionsText('Diktuj poznámku...');
    SpeechKITT.displayRecognizedSentence(true);

    // Toggle SpeechKITT and annyang
    if (!SpeechKITT.isListening()) {
        SpeechKITT.setStartCommand(() => annyang.start({ continuous: true }));
        SpeechKITT.setAbortCommand(() => annyang.abort());
        SpeechKITT.vroom();
    } else {
        if (annyang.isListening()) {
            SpeechKITT.abortRecognition();
            document.getElementById('voiceButton').textContent = "Start Voice Recognition";
        } else {
            SpeechKITT.startRecognition();
            document.getElementById('voiceButton').textContent = "Stop Voice Recognition";
        }
    }

    // Handle voice recognition result
    annyang.addCallback('result', function (phrases) {
        // Assume the first phrase is the most accurate
        let text = phrases[0];
        const notebookId = document.querySelector('.nav-link.active')?.dataset.notebookId;
        if (notebookId && text.trim() !== "") {
            addNote(text, notebookId);
            console.log("Added note: ", text);
            SpeechKITT.abortRecognition();
            document.getElementById('voiceButton').textContent = "Start Voice Recognition";
        }
    });
}
function exportAllNotebooks() {
    const userId = localStorage.getItem('userId'); // Ensure you have the userId stored in local storage
    const userNotebooksRef = firebase.database().ref(`notebooks`);

    userNotebooksRef.once('value', snapshot => {
        const notebooks = snapshot.val();
        if (!notebooks) {
            console.log("No notebooks to export.");
            return;
        }

        Object.keys(notebooks).forEach(notebookId => {
            const notebookData = notebooks[notebookId];
            exportNotebookAsTxt(notebookId, notebookData);
        });
    });
}

function exportNotebookAsTxt(notebookId, notebookData) {
    const notesRef = firebase.database().ref(`users/${userId}/notebooks/${notebookId}/notes`);
    notesRef.once('value', notesSnapshot => {
        const notes = notesSnapshot.val();
        let notesContent = `Notebook: ${notebookData.name || 'Unnamed Notebook'}\n\n`;

        Object.keys(notes).forEach(noteId => {
            const note = notes[noteId];
            notesContent += `${formatDate(new Date(note.createdAt))}\n${note.content}\n\n`;
        });

        triggerDownload(notesContent, `${notebookData.name || 'Unnamed_Notebook'}-${notebookId}.txt`);
    });
}

function triggerDownload(content, filename) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}


function initializeFontSettings() {
    // Attach change event listeners to font selection and size input
    document.getElementById('fontSelect').addEventListener('change', applyFontChange);
    document.getElementById('fontSizeInput').addEventListener('input', applyFontChange);

    // Load the initial preview when font settings are first set up
    updatePreview();
}

function applyFontChange() {
    var selectedFont = document.getElementById('fontSelect').value;
    var selectedFontSize = document.getElementById('fontSizeInput').value;

    // Ensure fonts are loaded from Google Fonts
    WebFont.load({
        google: {
            families: [selectedFont]
        },
        active: function () {
            var noteTextElements = document.querySelectorAll('.note-text');
            noteTextElements.forEach(function (element) {
                element.style.fontFamily = `'${selectedFont}', sans-serif`;
                element.style.fontSize = `${selectedFontSize}px`;
            });

            // Save the user's font and font size preference
            saveFontPreference(selectedFont, selectedFontSize);  // This function call saves to Firebase

            // Update the preview as well
            updatePreview();
        }
    });
}


function updatePreview() {
    const previewFont = document.getElementById('fontSelect').value;
    const previewSize = document.getElementById('fontSizeInput').value;
    const preview = document.getElementById('fontPreview');
    preview.style.fontFamily = `'${previewFont}', sans-serif`;
    preview.style.fontSize = `${previewSize}px`;
}


function applyFontToElements(font, fontSize) {
    const noteTextElements = document.querySelectorAll('.note-text');
    noteTextElements.forEach(element => {
        element.style.fontFamily = `'${font}', sans-serif`;
        element.style.fontSize = `${fontSize}px`;
    });
    updatePreview();
}

function observeNoteContainerChanges() {
    const container = document.getElementById('notesContainer');
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const currentFont = document.getElementById('fontSelect').value;
                const currentFontSize = document.getElementById('fontSizeInput').value;
                applyFontToElements(currentFont, currentFontSize);
            }
        });
    });

    observer.observe(container, {
        childList: true, // observe direct children additions or removals
        subtree: true // observe all descendants
    });
}

function updatePreview() {
    const previewFont = document.getElementById('fontSelect').value;
    const previewSize = document.getElementById('fontSizeInput').value;
    const preview = document.getElementById('fontPreview');
    preview.style.fontFamily = `'${previewFont}', sans-serif`;
    preview.style.fontSize = `${previewSize}px`;
}
function saveFontPreference(font, fontSize) {
    const userId = localStorage.getItem('userId');
    firebase.database().ref(`users/${userId}/settings`).update({
        fontPreference: font,
        fontSizePreference: fontSize
    }, (error) => {
        if (error) {
            console.error('Saving font settings failed: ', error);
        } else {
            console.log('Font settings saved successfully');
        }
    });
}

function loadFontPreference() {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        console.log('No user ID found, skipping load font preference.');
        return;
    }

    firebase.database().ref(`users/${userId}/settings`).once('value').then(snapshot => {
        const settings = snapshot.val();
        if (settings && settings.fontPreference && settings.fontSizePreference) {
            document.getElementById('fontSelect').value = settings.fontPreference;
            document.getElementById('fontSizeInput').value = settings.fontSizePreference;
            applyFontChange();
        }
    }).catch(error => {
        console.error('Failed to load font settings:', error);
    });
}



document.getElementById('spaceName').addEventListener('blur', function () {
    const spaceNameElement = document.getElementById('spaceName');
    if (!spaceNameElement.textContent.trim()) {
        spaceNameElement.textContent = localStorage.getItem('userId');  // Reset to userId if empty
        spaceNameElement.classList.add('placeholder');  // Reapply placeholder style
    }
    saveSpaceName();  // Save the space name when focus is lost
});
function saveSpaceName() {
    const spaceNameElement = document.getElementById('spaceName');
    if (!spaceNameElement.classList.contains('placeholder')) {
        const spaceName = spaceNameElement.textContent;
        const userId = localStorage.getItem('userId');
        const spaceRef = firebase.database().ref(`users/${userId}/spaceName`);
        spaceRef.set(spaceName, error => {
            if (error) {
                console.error('Error saving space name:', error);
            } else {
                console.log('Space name saved successfully');
            }
        });
    }
}