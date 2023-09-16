/* globals ExtensionCommon, Ci, Components */

var filters = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {

    function convertMsgSearchValue(val) {
      let retval = { attrib: val.attrib };
      switch (retval.attrib) {
        case Ci.nsMsgSearchAttrib.Priority:
          retval.priority = val.priority;
          break;
        case Ci.nsMsgSearchAttrib.Date:
          retval.date = val.date;
          break;
        case Ci.nsMsgSearchAttrib.MsgStatus:
          retval.status = val.status;
          break;
        case Ci.nsMsgSearchAttrib.Size:
          retval.size = val.size;
          break;
        case Ci.nsMsgSearchAttrib.MessageKey:
          retval.msgKey = val.msgKey;
          break;
        case Ci.nsMsgSearchAttrib.AgeInDays:
          retval.age = val.age;
          break;
        case Ci.nsMsgSearchAttrib.FolderInfo:
          retval.folder = context.extension.folderManager.convert(val.folder);
          break;
        case Ci.nsMsgSearchAttrib.JunkStatus:
          retval.junkStatus = val.junkStatus;
          break;
        case Ci.nsMsgSearchAttrib.JunkPercent:
          retval.junkPercent = val.junkPercent;
          break;
        default:
          // For some reason "val.str" throws 0x80070057 (NS_ERROR_ILLEGAL_VALUE), ignore such cases so as not to break the Filter button completely:
          try {
            retval.str = val.str;
          }
          catch (error) {
            retval.str = "Filter button error interpreting filter: " + error.str;
          }
          break;
      }
      return retval;
    }

    function convertMsgFilterAction(val) {
      let retval = {
        type: val.type,
        strValue: val.strValue
      };
      switch (retval.type) {
        case Ci.nsMsgFilterAction.MoveToFolder:
          retval.targetFolderUri = val.targetFolderUri;
          break;
        case Ci.nsMsgFilterAction.ChangePriority:
          retval.priority = val.priority;
          break;
        case Ci.nsMsgFilterAction.JunkScore:
          retval.junkScore = val.junkScore;
          break;
        case Ci.nsMsgFilterAction.ChangePriority:
          retval.customId = val.customId;
          break;
        default:
          break;
      }
      return retval;
    }

    function createFilterCloneWithoutTerms(filter, filterList) {
      var retval = filterList.createFilter(filter.filterName);
      retval.filterType = filter.filterType;
      retval.temporary = true;
      retval.enabled = true;
      retval.filterDesc = filter.filterDesc;
      retval.filterList = filterList;
      retval.scope = filter.scope;
      var nrActions = filter.actionCount;
      for (var i = 0; i < nrActions; i++)
        retval.appendAction(filter.getActionAt(i));
      return retval;
    }

    let filterMap = {};
    let filterIdCounter = 0;

    function convertFilter(realFilter) {
      let actions = [];
      for (let j = 0; j < realFilter.actionCount; j++) {
        actions.push(convertMsgFilterAction(realFilter.getActionAt(j)));
      }
      const retval = {
        filterId: filterIdCounter++,
        filterType: realFilter.filterType,
        filterName: realFilter.filterName,
        searchTerms: realFilter.searchTerms.map(t => ({
          attrib: t.attrib,
          op: t.op,
          value: convertMsgSearchValue(t.value),
          booleanAnd: t.booleanAnd,
          arbitraryHeader: t.arbitraryHeader
        })),
        actions: actions,
        filterDesc: realFilter.filterDesc,
        enabled: realFilter.enabled,
        temporary: realFilter.temporary
      };
      filterMap[retval.filterId] = realFilter;
      return retval;
    }

    return {
      filters: {
        async getFilters(folder) {
          filterMap = {}; // we reset the valid filterIds with every call to getFilters

          let msgFolder = context.extension.folderManager.get(folder.accountId, folder.path);
          let curFilterList = msgFolder.getFilterList(null);
          let filters = [];

          for (let i = 0; i < curFilterList.filterCount; i++) {
            let curFilter = curFilterList.getFilterAt(i);
            filters.push(convertFilter(curFilter));
          }
          return filters;
        },

        async filterMatches(filterId, messageId) {
          let filter = filterMap[filterId];
          if (!filter) {
            return false;
            // This should only be used when debugging the add-on: throw new Error('Invalid or stale filterId ' + filterId);
          }
          let msg = context.extension.messageManager.get(messageId);

          var session = Components.classes["@mozilla.org/messenger/searchSession;1"].createInstance(Ci.nsIMsgSearchSession);
          session.addScopeTerm(Ci.offlineMailFilter, msg.folder);

          for (var i = 0; i < filter.searchTerms.length; i++) {
            var term = filter.searchTerms[i];
            session.addSearchTerm(
              term.attrib, term.op, term.value,
              filter.searchTerms[0].booleanAnd, // Use the booleanAnd value of the first filter - thunderbird sometimes seems to write wrong values to booleaAnd of other filters
              term.arbitraryHeader
            );
          }

          return session.MatchHdr(msg, msg.folder.msgDatabase);
        },

        async executeFilterActions(filterId, messageId) {
          let filter = filterMap[filterId];
          let msg = context.extension.messageManager.get(messageId);
          let msgWindow = null; // TODO: do we need this?

          var filterService = Components.classes["@mozilla.org/messenger/services/filters;1"].getService(Components.interfaces.nsIMsgFilterService);
          var folder = msg.folder;
          var tempFilterList = filterService.getTempFilterList(folder);

          var curFilterList = folder.getFilterList(msgWindow);

          // make sure the tmp filter list uses the real filter list log stream
          tempFilterList.logStream = curFilterList.logStream;
          tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
          tempFilterList.insertFilterAt(0, createFilterCloneWithoutTerms(filter, tempFilterList));

          //temporarily switch filter lists
          folder.setFilterList(tempFilterList);
          try {
            filterService.applyFilters(Components.interfaces.nsMsgFilterType.All, [msg], folder, msgWindow);
          } finally {
            folder.setFilterList(curFilterList);
          }
        },

        async showNewFilterDialog(tabId, messageId) {
          let tabObject = context.extension.tabManager.get(tabId);
          let msgWindow = tabObject.window;
          let msg = context.extension.messageManager.get(messageId);
          let filterList = msg.folder.getEditableFilterList(null);

          let filter = filterList.createFilter(null);
          // If the "Create filter" button was pressed, preselect "manual" as filter type
          // As the filter button only really makes sense for manual filters
          filter.filterType = Ci.nsMsgFilterType.Manual;

          let term = filter.createTerm();
          term.attrib = Ci.nsMsgSearchAttrib.Sender;
          term.op = Ci.nsMsgSearchOp.Is;
          term.booleanAnd = true;
          let termValue = term.value;
          termValue.attrib = term.attrib;
          termValue.str =  msgWindow.MailServices.headerParser.extractHeaderAddressMailboxes(msg.author);
          term.value = termValue;
          filter.appendTerm(term);
          let filterAction = filter.createAction();
          filterAction.type = Ci.nsMsgFilterAction.MoveToFolder;
          filter.appendAction(filterAction);

          var args = {filterList, filter};
          msgWindow.openDialog("chrome://messenger/content/FilterEditor.xhtml", "",
                            "chrome, modal, resizable,centerscreen,dialog", args);
          if ("refresh" in args && args.refresh) {
            filterList.insertFilterAt(0, args.newFilter); // we need to add the filter manually, because the filter editor thinks it edited an existing filter
            return convertFilter(args.newFilter);
          }
          return false;

          /*
          alternative code to show filter editor, if the above stops working.
          this however will preselect 'run on incoming messages'

          let tabObject = context.extension.tabManager.get(tabId);
          let realTabWindow = tabObject.window;
          realTabWindow.document.commandDispatcher.getControllerForCommand("cmd_createFilterFromMenu")
            .doCommand("cmd_createFilterFromMenu");
          */
        }
      }
    };
  }
};
