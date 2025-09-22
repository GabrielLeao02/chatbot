const { Client } = require('whatsapp-web.js');


class LydiaClient extends Client
{
     /**
     * Sets up events and requirements, kicks off authentication request
     */
    //  async initialize() {
    //     let [browser, page] = [null, null];

    //     await this.authStrategy.beforeBrowserInitialized();

    //     const puppeteerOpts = this.options.puppeteer;
    //     if (puppeteerOpts && puppeteerOpts.browserWSEndpoint) {
    //         browser = await puppeteer.connect(puppeteerOpts);
    //         page = await browser.newPage();
    //     } else {
    //         const browserArgs = [...(puppeteerOpts.args || [])];
    //         if(!browserArgs.find(arg => arg.includes('--user-agent'))) {
    //             browserArgs.push(`--user-agent=${this.options.userAgent}`);
    //         }

    //         browser = await puppeteer.launch({...puppeteerOpts, args: browserArgs});
    //         page = (await browser.pages())[0];
    //     }

    //     if (this.options.proxyAuthentication !== undefined) {
    //         await page.authenticate(this.options.proxyAuthentication);
    //     }
      
    //     await page.setUserAgent(this.options.userAgent);
    //     if (this.options.bypassCSP) await page.setBypassCSP(true);

    //     this.pupBrowser = browser;
    //     this.pupPage = page;

    //     await this.authStrategy.afterBrowserInitialized();
    //     await this.initWebVersionCache();

    //     await page.goto(WhatsWebURL, {
    //         waitUntil: 'load',
    //         timeout: 0,
    //         referer: 'https://whatsapp.com/'
    //     });

    //     await page.evaluate(`function getElementByXpath(path) {
    //         return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    //       }`);

    //     let lastPercent = null,
    //         lastPercentMessage = null;

    //     await page.exposeFunction('loadingScreen', async (percent, message) => {
    //         if (lastPercent !== percent || lastPercentMessage !== message) {
    //             this.emit(Events.LOADING_SCREEN, percent, message);
    //             lastPercent = percent;
    //             lastPercentMessage = message;
    //         }
    //     });

    //     await page.evaluate(
    //         async function (selectors) {
    //             var observer = new MutationObserver(function () {
    //                 let progressBar = window.getElementByXpath(
    //                     selectors.PROGRESS
    //                 );
    //                 let progressMessage = window.getElementByXpath(
    //                     selectors.PROGRESS_MESSAGE
    //                 );

    //                 if (progressBar) {
    //                     window.loadingScreen(
    //                         progressBar.value,
    //                         progressMessage.innerText
    //                     );
    //                 }
    //             });

    //             observer.observe(document, {
    //                 attributes: true,
    //                 childList: true,
    //                 characterData: true,
    //                 subtree: true,
    //             });
    //         },
    //         {
    //             PROGRESS: '//*[@id=\'app\']/div/div/div[2]/progress',
    //             PROGRESS_MESSAGE: '//*[@id=\'app\']/div/div/div[3]',
    //         }
    //     );

    //     const INTRO_IMG_SELECTOR = '[data-testid="intro-md-beta-logo-dark"], [data-testid="intro-md-beta-logo-light"], [data-asset-intro-image-light="true"], [data-asset-intro-image-dark="true"]';
    //     const INTRO_QRCODE_SELECTOR = 'div[data-ref] canvas';

    //     // Checks which selector appears first
    //     const needAuthentication = await Promise.race([
    //         new Promise(resolve => {
    //             page.waitForSelector(INTRO_IMG_SELECTOR, { timeout: this.options.authTimeoutMs })
    //                 .then(() => resolve(false))
    //                 .catch((err) => resolve(err));
    //         }),
    //         new Promise(resolve => {
    //             page.waitForSelector(INTRO_QRCODE_SELECTOR, { timeout: this.options.authTimeoutMs })
    //                 .then(() => resolve(true))
    //                 .catch((err) => resolve(err));
    //         })
    //     ]);

    //     // Checks if an error occurred on the first found selector. The second will be discarded and ignored by .race;
    //     if (needAuthentication instanceof Error) throw needAuthentication;

    //     // Scan-qrcode selector was found. Needs authentication
    //     if (needAuthentication) {
    //         const { failed, failureEventPayload, restart } = await this.authStrategy.onAuthenticationNeeded();
    //         if(failed) {
    //             /**
    //              * Emitted when there has been an error while trying to restore an existing session
    //              * @event Client#auth_failure
    //              * @param {string} message
    //              */
    //             this.emit(Events.AUTHENTICATION_FAILURE, failureEventPayload);
    //             await this.destroy();
    //             if (restart) {
    //                 // session restore failed so try again but without session to force new authentication
    //                 return this.initialize();
    //             }
    //             return;
    //         }

    //         const QR_CONTAINER = 'div[data-ref]';
    //         const QR_RETRY_BUTTON = 'div[data-ref] > span > button';
    //         let qrRetries = 0;
    //         await page.exposeFunction('qrChanged', async (qr) => {
    //             /**
    //             * Emitted when a QR code is received
    //             * @event Client#qr
    //             * @param {string} qr QR Code
    //             */
    //             this.emit(Events.QR_RECEIVED, qr);
    //             if (this.options.qrMaxRetries > 0) {
    //                 qrRetries++;
    //                 if (qrRetries > this.options.qrMaxRetries) {
    //                     this.emit(Events.DISCONNECTED, 'Max qrcode retries reached');
    //                     await this.destroy();
    //                 }
    //             }
    //         });

    //         await page.evaluate(function (selectors) {
    //             const qr_container = document.querySelector(selectors.QR_CONTAINER);
    //             window.qrChanged(qr_container.dataset.ref);

    //             const obs = new MutationObserver((muts) => {
    //                 muts.forEach(mut => {
    //                     // Listens to qr token change
    //                     if (mut.type === 'attributes' && mut.attributeName === 'data-ref') {
    //                         window.qrChanged(mut.target.dataset.ref);
    //                     }
    //                     // Listens to retry button, when found, click it
    //                     else if (mut.type === 'childList') {
    //                         const retry_button = document.querySelector(selectors.QR_RETRY_BUTTON);
    //                         if (retry_button) retry_button.click();
    //                     }
    //                 });
    //             });
    //             obs.observe(qr_container.parentElement, {
    //                 subtree: true,
    //                 childList: true,
    //                 attributes: true,
    //                 attributeFilter: ['data-ref'],
    //             });
    //         }, {
    //             QR_CONTAINER,
    //             QR_RETRY_BUTTON
    //         });

    //         // Wait for code scan
    //         try {
    //             await page.waitForSelector(INTRO_IMG_SELECTOR, { timeout: 0 });
    //         } catch(error) {
    //             if (
    //                 error.name === 'ProtocolError' && 
    //                 error.message && 
    //                 error.message.match(/Target closed/)
    //             ) {
    //                 // something has called .destroy() while waiting
    //                 return;
    //             }

    //             throw error;
    //         }

    //     }

    //     await page.evaluate(() => {
    //         /**
    //          * Helper function that compares between two WWeb versions. Its purpose is to help the developer to choose the correct code implementation depending on the comparison value and the WWeb version.
    //          * @param {string} lOperand The left operand for the WWeb version string to compare with
    //          * @param {string} operator The comparison operator
    //          * @param {string} rOperand The right operand for the WWeb version string to compare with
    //          * @returns {boolean} Boolean value that indicates the result of the comparison
    //          */
    //         window.compareWwebVersions = (lOperand, operator, rOperand) => {
    //             if (!['>', '>=', '<', '<=', '='].includes(operator)) {
    //                 throw new class _ extends Error {
    //                     constructor(m) { super(m); this.name = 'CompareWwebVersionsError'; }
    //                 }('Invalid comparison operator is provided');

    //             }
    //             if (typeof lOperand !== 'string' || typeof rOperand !== 'string') {
    //                 throw new class _ extends Error {
    //                     constructor(m) { super(m); this.name = 'CompareWwebVersionsError'; }
    //                 }('A non-string WWeb version type is provided');
    //             }

    //             lOperand = lOperand.replace(/-beta$/, '');
    //             rOperand = rOperand.replace(/-beta$/, '');

    //             while (lOperand.length !== rOperand.length) {
    //                 lOperand.length > rOperand.length
    //                     ? rOperand = rOperand.concat('0')
    //                     : lOperand = lOperand.concat('0');
    //             }

    //             lOperand = Number(lOperand.replace(/\./g, ''));
    //             rOperand = Number(rOperand.replace(/\./g, ''));

    //             return (
    //                 operator === '>' ? lOperand > rOperand :
    //                     operator === '>=' ? lOperand >= rOperand :
    //                         operator === '<' ? lOperand < rOperand :
    //                             operator === '<=' ? lOperand <= rOperand :
    //                                 operator === '=' ? lOperand === rOperand :
    //                                     false
    //             );
    //         };
    //     });

    //     await page.evaluate(ExposeStore, moduleRaid.toString());
    //     const authEventPayload = await this.authStrategy.getAuthEventPayload();

    //     /**
    //      * Emitted when authentication is successful
    //      * @event Client#authenticated
    //      */
    //     this.emit(Events.AUTHENTICATED, authEventPayload);

    //     // Check window.Store Injection
    //     await page.waitForFunction('window.Store != undefined');

    //     await page.evaluate(async () => {
    //         // safely unregister service workers
    //         const registrations = await navigator.serviceWorker.getRegistrations();
    //         for (let registration of registrations) {
    //             registration.unregister();
    //         }
    //     });

    //     //Load util functions (serializers, helper functions)
    //     await page.evaluate(LoadUtils);

    //     // Expose client info
    //     /**
    //      * Current connection information
    //      * @type {ClientInfo}
    //      */
    //     this.info = new ClientInfo(this, await page.evaluate(() => {
    //         return { ...window.Store.Conn.serialize(), wid: window.Store.User.getMeUser() };
    //     }));

    //     // Add InterfaceController
    //     this.interface = new InterfaceController(this);

    //     // Register events
    //     await page.exposeFunction('onAddMessageEvent', msg => {
    //         if (msg.type === 'gp2') {
    //             const notification = new GroupNotification(this, msg);
    //             if (['add', 'invite', 'linked_group_join'].includes(msg.subtype)) {
    //                 /**
    //                  * Emitted when a user joins the chat via invite link or is added by an admin.
    //                  * @event Client#group_join
    //                  * @param {GroupNotification} notification GroupNotification with more information about the action
    //                  */
    //                 this.emit(Events.GROUP_JOIN, notification);
    //             } else if (msg.subtype === 'remove' || msg.subtype === 'leave') {
    //                 /**
    //                  * Emitted when a user leaves the chat or is removed by an admin.
    //                  * @event Client#group_leave
    //                  * @param {GroupNotification} notification GroupNotification with more information about the action
    //                  */
    //                 this.emit(Events.GROUP_LEAVE, notification);
    //             } else if (msg.subtype === 'promote' || msg.subtype === 'demote') {
    //                 /**
    //                  * Emitted when a current user is promoted to an admin or demoted to a regular user.
    //                  * @event Client#group_admin_changed
    //                  * @param {GroupNotification} notification GroupNotification with more information about the action
    //                  */
    //                 this.emit(Events.GROUP_ADMIN_CHANGED, notification);
    //             } else if (msg.subtype === 'created_membership_requests') {
    //                 /**
    //                  * Emitted when some user requested to join the group
    //                  * that has the membership approval mode turned on
    //                  * @event Client#group_membership_request
    //                  * @param {GroupNotification} notification GroupNotification with more information about the action
    //                  * @param {string} notification.chatId The group ID the request was made for
    //                  * @param {string} notification.author The user ID that made a request
    //                  * @param {number} notification.timestamp The timestamp the request was made at
    //                  */
    //                 this.emit(Events.GROUP_MEMBERSHIP_REQUEST, notification);
    //             } else {
    //                 /**
    //                  * Emitted when group settings are updated, such as subject, description or picture.
    //                  * @event Client#group_update
    //                  * @param {GroupNotification} notification GroupNotification with more information about the action
    //                  */
    //                 this.emit(Events.GROUP_UPDATE, notification);
    //             }
    //             return;
    //         }

    //         const message = new Message(this, msg);

    //         /**
    //          * Emitted when a new message is created, which may include the current user's own messages.
    //          * @event Client#message_create
    //          * @param {Message} message The message that was created
    //          */
    //         this.emit(Events.MESSAGE_CREATE, message);

    //         if (msg.id.fromMe) return;

    //         /**
    //          * Emitted when a new message is received.
    //          * @event Client#message
    //          * @param {Message} message The message that was received
    //          */
    //         this.emit(Events.MESSAGE_RECEIVED, message);
    //     });

    //     let last_message;

    //     await page.exposeFunction('onChangeMessageTypeEvent', (msg) => {

    //         if (msg.type === 'revoked') {
    //             const message = new Message(this, msg);
    //             let revoked_msg;
    //             if (last_message && msg.id.id === last_message.id.id) {
    //                 revoked_msg = new Message(this, last_message);
    //             }

    //             /**
    //              * Emitted when a message is deleted for everyone in the chat.
    //              * @event Client#message_revoke_everyone
    //              * @param {Message} message The message that was revoked, in its current state. It will not contain the original message's data.
    //              * @param {?Message} revoked_msg The message that was revoked, before it was revoked. It will contain the message's original data. 
    //              * Note that due to the way this data is captured, it may be possible that this param will be undefined.
    //              */
    //             this.emit(Events.MESSAGE_REVOKED_EVERYONE, message, revoked_msg);
    //         }

    //     });

    //     await page.exposeFunction('onChangeMessageEvent', (msg) => {

    //         if (msg.type !== 'revoked') {
    //             last_message = msg;
    //         }

    //         /**
    //          * The event notification that is received when one of
    //          * the group participants changes their phone number.
    //          */
    //         const isParticipant = msg.type === 'gp2' && msg.subtype === 'modify';

    //         /**
    //          * The event notification that is received when one of
    //          * the contacts changes their phone number.
    //          */
    //         const isContact = msg.type === 'notification_template' && msg.subtype === 'change_number';

    //         if (isParticipant || isContact) {
    //             /** @type {GroupNotification} object does not provide enough information about this event, so a @type {Message} object is used. */
    //             const message = new Message(this, msg);

    //             const newId = isParticipant ? msg.recipients[0] : msg.to;
    //             const oldId = isParticipant ? msg.author : msg.templateParams.find(id => id !== newId);

    //             /**
    //              * Emitted when a contact or a group participant changes their phone number.
    //              * @event Client#contact_changed
    //              * @param {Message} message Message with more information about the event.
    //              * @param {String} oldId The user's id (an old one) who changed their phone number
    //              * and who triggered the notification.
    //              * @param {String} newId The user's new id after the change.
    //              * @param {Boolean} isContact Indicates if a contact or a group participant changed their phone number.
    //              */
    //             this.emit(Events.CONTACT_CHANGED, message, oldId, newId, isContact);
    //         }
    //     });

    //     await page.exposeFunction('onRemoveMessageEvent', (msg) => {

    //         if (!msg.isNewMsg) return;

    //         const message = new Message(this, msg);

    //         /**
    //          * Emitted when a message is deleted by the current user.
    //          * @event Client#message_revoke_me
    //          * @param {Message} message The message that was revoked
    //          */
    //         this.emit(Events.MESSAGE_REVOKED_ME, message);

    //     });

    //     await page.exposeFunction('onMessageAckEvent', (msg, ack) => {

    //         const message = new Message(this, msg);

    //         /**
    //          * Emitted when an ack event occurrs on message type.
    //          * @event Client#message_ack
    //          * @param {Message} message The message that was affected
    //          * @param {MessageAck} ack The new ACK value
    //          */
    //         this.emit(Events.MESSAGE_ACK, message, ack);

    //     });

    //     await page.exposeFunction('onChatUnreadCountEvent', async (data) =>{
    //         const chat = await this.getChatById(data.id);
            
    //         /**
    //          * Emitted when the chat unread count changes
    //          */
    //         this.emit(Events.UNREAD_COUNT, chat);
    //     });

    //     await page.exposeFunction('onMessageMediaUploadedEvent', (msg) => {

    //         const message = new Message(this, msg);

    //         /**
    //          * Emitted when media has been uploaded for a message sent by the client.
    //          * @event Client#media_uploaded
    //          * @param {Message} message The message with media that was uploaded
    //          */
    //         this.emit(Events.MEDIA_UPLOADED, message);
    //     });

    //     await page.exposeFunction('onAppStateChangedEvent', async (state) => {

    //         /**
    //          * Emitted when the connection state changes
    //          * @event Client#change_state
    //          * @param {WAState} state the new connection state
    //          */
    //         this.emit(Events.STATE_CHANGED, state);

    //         const ACCEPTED_STATES = [WAState.CONNECTED, WAState.OPENING, WAState.PAIRING, WAState.TIMEOUT];

    //         if (this.options.takeoverOnConflict) {
    //             ACCEPTED_STATES.push(WAState.CONFLICT);

    //             if (state === WAState.CONFLICT) {
    //                 setTimeout(() => {
    //                     this.pupPage.evaluate(() => window.Store.AppState.takeover());
    //                 }, this.options.takeoverTimeoutMs);
    //             }
    //         }

    //         if (!ACCEPTED_STATES.includes(state)) {
    //             /**
    //              * Emitted when the client has been disconnected
    //              * @event Client#disconnected
    //              * @param {WAState|"NAVIGATION"} reason reason that caused the disconnect
    //              */
    //             await this.authStrategy.disconnect();
    //             this.emit(Events.DISCONNECTED, state);
    //             this.destroy();
    //         }
    //     });

    //     await page.exposeFunction('onBatteryStateChangedEvent', (state) => {
    //         const { battery, plugged } = state;

    //         if (battery === undefined) return;

    //         /**
    //          * Emitted when the battery percentage for the attached device changes. Will not be sent if using multi-device.
    //          * @event Client#change_battery
    //          * @param {object} batteryInfo
    //          * @param {number} batteryInfo.battery - The current battery percentage
    //          * @param {boolean} batteryInfo.plugged - Indicates if the phone is plugged in (true) or not (false)
    //          * @deprecated
    //          */
    //         this.emit(Events.BATTERY_CHANGED, { battery, plugged });
    //     });

    //     await page.exposeFunction('onIncomingCall', (call) => {
    //         /**
    //          * Emitted when a call is received
    //          * @event Client#incoming_call
    //          * @param {object} call
    //          * @param {number} call.id - Call id
    //          * @param {string} call.peerJid - Who called
    //          * @param {boolean} call.isVideo - if is video
    //          * @param {boolean} call.isGroup - if is group
    //          * @param {boolean} call.canHandleLocally - if we can handle in waweb
    //          * @param {boolean} call.outgoing - if is outgoing
    //          * @param {boolean} call.webClientShouldHandle - If Waweb should handle
    //          * @param {object} call.participants - Participants
    //          */
    //         const cll = new Call(this, call);
    //         this.emit(Events.INCOMING_CALL, cll);
    //     });

    //     await page.exposeFunction('onReaction', (reactions) => {
    //         for (const reaction of reactions) {
    //             /**
    //              * Emitted when a reaction is sent, received, updated or removed
    //              * @event Client#message_reaction
    //              * @param {object} reaction
    //              * @param {object} reaction.id - Reaction id
    //              * @param {number} reaction.orphan - Orphan
    //              * @param {?string} reaction.orphanReason - Orphan reason
    //              * @param {number} reaction.timestamp - Timestamp
    //              * @param {string} reaction.reaction - Reaction
    //              * @param {boolean} reaction.read - Read
    //              * @param {object} reaction.msgId - Parent message id
    //              * @param {string} reaction.senderId - Sender id
    //              * @param {?number} reaction.ack - Ack
    //              */

    //             this.emit(Events.MESSAGE_REACTION, new Reaction(this, reaction));
    //         }
    //     });

    //     await page.exposeFunction('onRemoveChatEvent', async (chat) => {
    //         const _chat = await this.getChatById(chat.id);

    //         /**
    //          * Emitted when a chat is removed
    //          * @event Client#chat_removed
    //          * @param {Chat} chat
    //          */
    //         this.emit(Events.CHAT_REMOVED, _chat);
    //     });
        
    //     await page.exposeFunction('onArchiveChatEvent', async (chat, currState, prevState) => {
    //         const _chat = await this.getChatById(chat.id);
            
    //         /**
    //          * Emitted when a chat is archived/unarchived
    //          * @event Client#chat_archived
    //          * @param {Chat} chat
    //          * @param {boolean} currState
    //          * @param {boolean} prevState
    //          */
    //         this.emit(Events.CHAT_ARCHIVED, _chat, currState, prevState);
    //     });

    //     await page.exposeFunction('onEditMessageEvent', (msg, newBody, prevBody) => {
            
    //         if(msg.type === 'revoked'){
    //             return;
    //         }
    //         /**
    //          * Emitted when messages are edited
    //          * @event Client#message_edit
    //          * @param {Message} message
    //          * @param {string} newBody
    //          * @param {string} prevBody
    //          */
    //         this.emit(Events.MESSAGE_EDIT, new Message(this, msg), newBody, prevBody);
    //     });

    //     await page.evaluate(() => {
    //         window.Store.Msg.on('change', (msg) => { window.onChangeMessageEvent(window.WWebJS.getMessageModel(msg)); });
    //         window.Store.Msg.on('change:type', (msg) => { window.onChangeMessageTypeEvent(window.WWebJS.getMessageModel(msg)); });
    //         window.Store.Msg.on('change:ack', (msg, ack) => { window.onMessageAckEvent(window.WWebJS.getMessageModel(msg), ack); });
    //         window.Store.Msg.on('change:isUnsentMedia', (msg, unsent) => { if (msg.id.fromMe && !unsent) window.onMessageMediaUploadedEvent(window.WWebJS.getMessageModel(msg)); });
    //         window.Store.Msg.on('remove', (msg) => { if (msg.isNewMsg) window.onRemoveMessageEvent(window.WWebJS.getMessageModel(msg)); });
    //         window.Store.Msg.on('change:body', (msg, newBody, prevBody) => { window.onEditMessageEvent(window.WWebJS.getMessageModel(msg), newBody, prevBody); });
    //         window.Store.AppState.on('change:state', (_AppState, state) => { window.onAppStateChangedEvent(state); });
    //         window.Store.Conn.on('change:battery', (state) => { window.onBatteryStateChangedEvent(state); });
    //         window.Store.Call.on('add', (call) => { window.onIncomingCall(call); });
    //         window.Store.Chat.on('remove', async (chat) => { window.onRemoveChatEvent(await window.WWebJS.getChatModel(chat)); });
    //         window.Store.Chat.on('change:archive', async (chat, currState, prevState) => { window.onArchiveChatEvent(await window.WWebJS.getChatModel(chat), currState, prevState); });
    //         window.Store.Msg.on('add', (msg) => { 
    //             if (msg.isNewMsg) {
    //                 if(msg.type === 'ciphertext') {
    //                     // defer message event until ciphertext is resolved (type changed)
    //                     msg.once('change:type', (_msg) => window.onAddMessageEvent(window.WWebJS.getMessageModel(_msg)));
    //                 } else {
    //                     window.onAddMessageEvent(window.WWebJS.getMessageModel(msg)); 
    //                 }
    //             }
    //         });
    //         window.Store.Chat.on('change:unreadCount', (chat) => {window.onChatUnreadCountEvent(chat);});

    //         {
    //             const module = window.Store.createOrUpdateReactionsModule;
    //             const ogMethod = module.createOrUpdateReactions;
    //             module.createOrUpdateReactions = ((...args) => {
    //                 window.onReaction(args[0].map(reaction => {
    //                     const msgKey = window.Store.MsgKey.fromString(reaction.msgKey);
    //                     const parentMsgKey = window.Store.MsgKey.fromString(reaction.parentMsgKey);
    //                     const timestamp = reaction.timestamp / 1000;

    //                     return {...reaction, msgKey, parentMsgKey, timestamp };
    //                 }));

    //                 return ogMethod(...args);
    //             }).bind(module);
    //         }
    //     });

    //     /**
    //      * Emitted when the client has initialized and is ready to receive messages.
    //      * @event Client#ready
    //      */
    //     this.emit(Events.READY);
    //     this.authStrategy.afterAuthReady();

    //     // Disconnect when navigating away when in PAIRING state (detect logout)
    //     this.pupPage.on('framenavigated', async () => {
    //         const appState = await this.getState();
    //         if(!appState || appState === WAState.PAIRING) {
    //             await this.authStrategy.disconnect();
    //             this.emit(Events.DISCONNECTED, 'NAVIGATION');
    //             await this.destroy();
    //         }
    //     });
    // }

    
}

module.exports = LydiaClient;