const firebaseConfig = {
    databaseURL: "https://voice-noter-default-rtdb.europe-west1.firebasedatabase.app",
};
firebase.initializeApp(firebaseConfig);document.addEventListener('DOMContentLoaded', async function () {
    setUpUserTooltip();
    initializeFontSettings();
    loadFontPreference();
    observeNoteContainerChanges();

    const urlParams = new URLSearchParams(window.location.search);
    const notebookToken = urlParams.get('notebookToken');

    const createNotebookButton = document.getElementById('createNotebookButton');

    if (notebookToken) {
        console.log("notebookToken " + notebookToken);
        await loadSingleNotebookByToken(notebookToken);
        if (createNotebookButton) {
            createNotebookButton.style.display = 'none'; // Hide the button
        }
    } else {
        console.log("No specific token found, loading default notebooks...");
        await loadUserNotebooks();
        if (createNotebookButton) {
            createNotebookButton.style.display = 'block'; // Show the button
        }
    }
    setUpNoteInput();

    try {
        toggleSpeechKITT();
    } catch (error) {
        console.error("Speech recognition initialization failed:", error);
        document.querySelector(".status").innerHTML = "Annyang is not supported in your browser! Use Edge or Chrome on Android or PC";
        document.querySelector(".status").classList.toggle("active");
    }
});
async function loadSingleNotebookByToken(token) {
    const notebookId = await getNotebookIdByToken(token);
    if (notebookId) {
        console.log("Notebook ID found:", notebookId);
        activeNotebookId = notebookId; // Set the active notebook ID globally
        loadNotes(notebookId);
        updateHeaderWithNotebookInfo(token); // Update the header
    } else {
        console.error("Invalid notebookToken. No notebook found.");
    }
}

async function getNotebookIdByToken(token) {
    const notebooksRef = firebase.database().ref('notebooks');
    try {
        const snapshot = await notebooksRef.once('value');
        const notebooks = snapshot.val() || {};
        for (let notebookId in notebooks) {
            if (notebooks[notebookId] && notebooks[notebookId].token === token) {
                return notebookId;
            }
        }
        return null;
    } catch (error) {
        console.error("Error retrieving notebook by token:", error);
        return null;
    }
}

function updateHeaderWithNotebookInfo(token) {
    const headerElement = document.getElementById('header'); // Assuming you have a header element with this ID
    if (token) {
        headerElement.textContent = `Notebook token /\n ${token}`;
    } else {
        headerElement.textContent = 'Notebook token /\n not found.';
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
function createTab(notebookId, setActive = false, noteCount = 0, notebookName = "") {
    const tab = document.createElement('li');
    tab.className = 'nav-item d-inline-flex justify-content-between';

    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = '#';
    link.dataset.notebookId = notebookId;
    link.setAttribute('title', `ID: ${notebookId}`);

    const img = document.createElement('img');
    img.src = "note.svg";
    img.alt = "Note Icon";
    img.className = 'ms-2';
    img.style.width = "24px";
    img.style.height = "24px";

    const nameLabel = document.createElement('span');
    nameLabel.className = 'notebook-name m-2';
    nameLabel.textContent = notebookName;

    const badge = document.createElement('span');
    badge.className = 'badge bg-primary m-2';
    badge.textContent = noteCount;

    const dropdownBtn = document.createElement('button');
    dropdownBtn.className = 'btn';
    dropdownBtn.setAttribute('data-bs-toggle', 'dropdown');
    dropdownBtn.ariaExpanded = false;
    dropdownBtn.innerHTML = '⋮';

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'dropdown-menu';
    dropdownMenu.appendChild(createDropdownItem('Rename', () => promptRenameNotebook(notebookId, nameLabel)));

    // Initially, don't pass the token here
    const shareNotebookItem = createDropdownItem('Share Notebook', () => shareNotebook(notebookId, null));
    dropdownMenu.appendChild(shareNotebookItem); // Added share functionality

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

    // Fetch and display the token in the title attribute and update the shareNotebook function
    getNotebookToken(notebookId).then(token => {
        link.setAttribute('title', `ID: ${notebookId}\nToken: ${token}`);
        shareNotebookItem.onclick = function (event) {
            event.preventDefault();
            shareNotebook(notebookId, token);
        };
    }).catch(error => {
        console.error('Error retrieving token:', error);
    });

    document.getElementById('notebookTabs').appendChild(tab);

    if (setActive) {
        link.click();
    }

    return { badge: badge, nameLabel: nameLabel };
}

function shareNotebook(notebookId, token) {
    if (token) {
        const baseUrl = window.location.origin;
        const shareableLink = `${baseUrl}/Voice-Noter/?notebookToken=${token}`;
        redirectToSharePage(shareableLink);
    } else {
        getNotebookToken(notebookId).then(token => {
            if (token) {
                const baseUrl = window.location.origin;
                const shareableLink = `${baseUrl}/Voice-Noter/?notebookToken=${token}`;
                redirectToSharePage(shareableLink);
            } else {
                console.error('No token found for this notebook');
            }
        }).catch(error => {
            console.error('Error generating shareable link:', error);
        });
    }
}

function redirectToSharePage(shareableLink) {
    const sharePageUrl = `${window.location.origin}/share.html?link=${encodeURIComponent(shareableLink)}`;
    window.location.href = sharePageUrl;
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



async function getNotebookToken(notebookId) {
    const notebookRef = firebase.database().ref(`notebooks/${notebookId}`);
    try {
        const snapshot = await notebookRef.once('value');
        const notebook = snapshot.val();
        if (notebook && notebook.token) {
            console.log("Existing token found:", notebook.token);
            return notebook.token;
        } else {
            console.error("Token not found for notebook:", notebookId);
            return null;
        }
    } catch (error) {
        console.error("Error retrieving token:", error);
        return null;
    }
}

function downloadNotebookAsText(notebookId) {
    const notesRef = firebase.database().ref(`notebooks/${notebookId}/notes`);
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

function shareNotePrompt(notebookId) {
    const noteId = prompt("Enter the note ID to share:");
    if (noteId) {
        shareNoteToken(notebookId, noteId);
    }
}

function shareNoteToken(notebookId, noteId) {
    const noteRef = firebase.database().ref(`notebooks/${notebookId}/notes/${noteId}`);
    noteRef.once('value', snapshot => {
        const note = snapshot.val();
        if (note && note.token) {
            const shareableLink = `${window.location.origin}?noteToken=${note.token}`;
            prompt("Copy this link to share the note:", shareableLink);
        } else {
            console.error('No token found for this note');
        }
    });
}

function generateCustomNotebookId() {
    return [...Array(16)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
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

function addNoteFromInput() {
    const noteContent = document.getElementById('noteInput').value;
    const notebookId = activeNotebookId; // Use the global variable
    if (noteContent && notebookId) {
        addNote(noteContent, notebookId);
        document.getElementById('noteInput').value = ''; // Clear the input after adding a note
    }
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
function loadNotes(notebookId) {
    activeNotebookId = notebookId; // Set the active notebook ID globally
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


function updateNoteCount(notebookId, increment) {
    const badge = document.querySelector(`a[data-notebook-id="${notebookId}"] .badge`);
    let count = parseInt(badge.textContent) || 0;
    badge.textContent = count + increment;
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

function formatDate(date) {
    let day = date.getDate().toString().padStart(2, '0');
    let month = (date.getMonth() + 1).toString().padStart(2, '0'); // Months start at 0!
    let year = date.getFullYear();
    let hours = date.getHours().toString().padStart(2, '0');
    let minutes = date.getMinutes().toString().padStart(2, '0');
    let seconds = date.getSeconds().toString().padStart(2, '0'); // Include seconds

    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}
function initializeSpeechRecognition() {
    if (typeof annyang === 'undefined' || typeof SpeechKITT === 'undefined') {
        console.error("Annyang or SpeechKITT is not loaded!");
        return;
    }
    try {
        
    // Initialize SpeechKITT settings once
    SpeechKITT.annyang();
    annyang.setLanguage('cs'); // Set the desired language

    SpeechKITT.setStylesheet('https://cdnjs.cloudflare.com/ajax/libs/SpeechKITT/1.0.0/themes/flat.css');
    SpeechKITT.setInstructionsText('Diktuj poznámku...');
    SpeechKITT.displayRecognizedSentence(true);

    // Set up SpeechKITT commands
    SpeechKITT.setStartCommand(() => annyang.start({ continuous: true }));
    SpeechKITT.setAbortCommand(() => annyang.abort());

    // Display SpeechKITT interface
    SpeechKITT.vroom();

    // Handle voice recognition result
    annyang.addCallback('result', function (phrases) {
        let text = phrases[0];
        const notebookId = document.querySelector('.nav-link.active')?.dataset.notebookId;
        if (notebookId && text.trim() !== "") {
            addNote(text, notebookId);
            console.log("Added note: ", text);
            SpeechKITT.abortRecognition();
            document.getElementById('voiceButton').textContent = "Start Voice Recognition";
        }
    });

    document.getElementById('voiceButton').addEventListener('click', toggleSpeechKITT);
    } catch (error) {
        console.error("Speech recognition initialization failed:", error);
       
    }
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

function applyFontToElements(font, fontSize) {
    const noteTextElements = document.querySelectorAll('.note-text');
    noteTextElements.forEach(element => {
        element.style.fontFamily = `'${font}', sans-serif`;
        element.style.fontSize = `${fontSize}px`;
    });
    updatePreview();
}
function exportNotebookAsTxt(notebookId, notebookData) {
    const notesRef = firebase.database().ref(`notebooks/${notebookId}/notes`);
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

// Utility functions

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

async function getActiveTabUID() {
    return localStorage.getItem('activeTabUID');
}

function saveActiveTabUID(uid) {
    localStorage.setItem('activeTabUID', uid);
}
