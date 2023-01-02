async function load() {
    let matchingFiltersPerTab = {};

    async function updateButton(message, tabId) {
        const filters = await messenger.filters.getFilters(message.folder);
        let matchingFilters = [];
        matchingFiltersPerTab[tabId] = matchingFilters;
        for (let filter of filters) {
            if (!filter.temporary && await messenger.filters.filterMatches(filter.filterId, message.id)) {
                matchingFilters.push(filter);
            }
        }
        messenger.messageDisplayAction.setIcon({
            path: matchingFilters.length ? {
                "64": "images/button_64.png",
                "32": "images/button_32.png",
                "16": "images/button_16.png"
            } : {
                "64": "images/button_empty_64.png",
                "32": "images/button_empty_32.png",
                "16": "images/button_empty_16.png"
            }, tabId: tabId
        });
        if (matchingFilters.length == 0) {
            messenger.messageDisplayAction.setTitle({ title: messenger.i18n.getMessage("noMatchingFiltersTitle"), tabId: tabId });
            messenger.messageDisplayAction.setLabel({ label: messenger.i18n.getMessage("extensionName"), tabId: tabId });
            messenger.messageDisplayAction.setBadgeText({ text: null, tabId: tabId });
            messenger.messageDisplayAction.setPopup({popup: null, tabId: tabId});
        } else if (matchingFilters.length == 1) {
            messenger.messageDisplayAction.setTitle({ title: matchingFilters[0].filterName, tabId: tabId });
            messenger.messageDisplayAction.setLabel({ label: null, tabId: tabId });
            messenger.messageDisplayAction.setBadgeText({ text: null, tabId: tabId });
            messenger.messageDisplayAction.setPopup({popup: null, tabId: tabId});
        } else {
            messenger.messageDisplayAction.setTitle({ title: messenger.i18n.getMessage("nrMatchingFiltersTitle", matchingFilters.length), tabId: tabId });
            messenger.messageDisplayAction.setBadgeText({ text: matchingFilters.length + "", tabId: tabId });
            messenger.messageDisplayAction.setBadgeBackgroundColor({ color: [100, 100, 100, 230], tabId: tabId });
            messenger.messageDisplayAction.setLabel({ label: messenger.i18n.getMessage("filterButtonLabel"), tabId: tabId });
            messenger.messageDisplayAction.setPopup({popup: 'filterPopup/popup.htm', tabId: tabId});
        }
    }


    messenger.messageDisplay.onMessageDisplayed.addListener(async (tab, message) => {
        updateButton(message, tab.id);
    });

    messenger.windows.onFocusChanged.addListener(async () => {
        let tabs = await messenger.tabs.query({active:true});
        for (let tab of tabs) {
            const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
            if (message) {
                updateButton(message, tab.id);
            }
        }
    });

    messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
        let matchingFilters = matchingFiltersPerTab[tab.id];
        if (matchingFilters.length == 1) {
            const message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
            messenger.filters.executeFilterActions(matchingFilters[0].filterId, message.id);
        } else if (matchingFilters.length > 1) {
            // We should never reach this part, because onMessageDisplayed sets a popup in this case, and therefore the onclicked event is not triggered
            // But who knows...
            messenger.messageDisplayAction.setPopup({popup: 'filterPopup/popup.htm', tabId: tab.id});
            messenger.messageDisplayAction.openPopup();
        } else {
            let message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
            const result = await messenger.filters.showNewFilterDialog(tab.id, message.id);
            if (result) {
                message = await messenger.messageDisplay.getDisplayedMessage(tab.id);
                updateButton(message, tab.id);
            }
        }
    });


    messenger.runtime.onMessage.addListener(async (message) => {
        if (message && message.hasOwnProperty("command")) {
            switch (message.command) {
                case "getMatchingFilters":
                    let matchingFilters = matchingFiltersPerTab[message.tabId];
                    return matchingFilters;
                case "executeFilterActions":
                    const msg = await messenger.messageDisplay.getDisplayedMessage(message.tabId);
                    messenger.filters.executeFilterActions(message.filterId, msg.id);
                    break;
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", load);