/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
					Vienna, Virginia, USA
					http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

import { background } from '../support/utils.mjs';

describe("ItemSaver Background", function() {
	describe('_fetchAttachment', function() {
		let attachment, mockTab;
		
		beforeEach(async function() {
			attachment = {
				url: 'https://example.com/test.pdf',
				mimeType: 'application/pdf',
				referrer: 'https://example.com'
			};
			mockTab = { id: 123 };

			// Set up default stubs
			await background(function() {
				sinon.stub(browser.cookies, 'getAll').resolves([
					{ name: 'sessionid', value: 'abc123' },
					{ name: 'csrf', value: 'xyz789' }
				]);
				
				sinon.stub(Zotero.HTTP, 'request').resolves({
					response: new ArrayBuffer(1024),
					status: 200,
					getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '1024' : null
				});
				
				sinon.stub(Zotero.Utilities.Connector, 'getContentTypeFromXHR').returns({
					contentType: 'application/pdf'
				});
				
				sinon.stub(Zotero.BotBypass, 'passJSDetectionViaHiddenIframe')
					.resolves('https://example.com/corrected.pdf');
				
				sinon.stub(Zotero.BotBypass, 'passJSDetectionViaWindowPrompt')
					.resolves('https://example.com/corrected.pdf');

				sinon.stub(Zotero.BotBypass, 'isUrlWhitelisted').returns(true);
			});
		});

		afterEach(async function() {
			// Clean up all stubs
			await background(function() {
				browser.cookies.getAll.restore();
				Zotero.HTTP.request.restore();
				if (Zotero.Utilities.Connector.getContentTypeFromXHR.restore) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.restore();
				}
				Zotero.BotBypass.passJSDetectionViaHiddenIframe.restore();
				Zotero.BotBypass.passJSDetectionViaWindowPrompt.restore();
				Zotero.BotBypass.isUrlWhitelisted.restore();
				if (Zotero.BotBypass.bypassAmazonCaptcha.restore) {
					Zotero.BotBypass.bypassAmazonCaptcha.restore();
				}
			});
		});

		describe('When HTTP.request returns 200 and mimetype is correct', function() {
			it('should return the response ArrayBuffer', async function() {
				const result = await background(async function(attachment, mockTab) {
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});
		});

		describe('When HTTP.request returns 200 but mimetype is different', function() {
			it('should attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					const cookiesStub = sinon.stub(Zotero.Connector_Browser, 'getAllCookies').resolves([]);
					Zotero.Utilities.Connector.getContentTypeFromXHR.onFirstCall().returns({
						contentType: 'text/html'  // Wrong content type
					});
					
					Zotero.BotBypass.passJSDetectionViaHiddenIframe
						.resolves('https://sciencedirect.com/corrected.pdf');
					
					Zotero.Utilities.Connector.getContentTypeFromXHR.onSecondCall().returns({
						contentType: 'application/pdf'  // Correct content type on retry
					});
					
					try {
						const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
						return {
							byteLength: result.byteLength,
							cookieTabIDs: cookiesStub.args.map(args => args[1]),
							expectedMimeType: Zotero.BotBypass.passJSDetectionViaHiddenIframe.firstCall.args[2],
							windowPromptCalls: Zotero.BotBypass.passJSDetectionViaWindowPrompt.callCount
						};
					}
					finally {
						cookiesStub.restore();
					}
				}, attachment, mockTab);
				
				assert.equal(result.byteLength, 1024);
				assert.deepEqual(result.cookieTabIDs, [123, 123]);
				assert.equal(result.expectedMimeType, 'application/pdf');
				assert.equal(result.windowPromptCalls, 0);
			});

			it('should fallback to window prompt if iframe bypass fails', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.onFirstCall().returns({
						contentType: 'text/html'  // Wrong content type
					});
					
					// Mock bot bypass methods - iframe fails
					Zotero.BotBypass.passJSDetectionViaHiddenIframe
						.rejects(new Error('Iframe bypass failed'));
					
					Zotero.BotBypass.passJSDetectionViaWindowPrompt
						.resolves('https://sciencedirect.com/corrected.pdf');
					
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/pdf'
					});
					
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});

			it('should throw error for non-whitelisted domains', async function() {
				attachment.url = 'https://non-whitelisted.com/test.pdf';
				
				const error = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'text/html'
					});

					Zotero.BotBypass.isUrlWhitelisted.returns(false);
					
					try {
						await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
						return null;
					} catch (e) {
						return e.message;
					}
				}, attachment, mockTab);
				
				assert.include(error, 'Attachment MIME type text/html does not match specified type application/pdf');
			});
		});

		describe('When HTTP.request returns a bot-protection response', function() {
			it('should bypass Amazon WAF challenges with Sec-Fetch-Site: same-origin', async function() {
				const result = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.onFirstCall().resolves({
						response: new ArrayBuffer(0),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'x-amzn-waf-action') return 'challenge';
							if (header.toLowerCase() == 'content-length') return '0';
							return null;
						}
					});
					Zotero.HTTP.request.onSecondCall().resolves({
						response: new ArrayBuffer(2048),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'content-length') return '2048';
							if (header.toLowerCase() == 'content-type') return 'application/pdf';
							return null;
						}
					});

					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: result.byteLength,
						header: Zotero.HTTP.request.secondCall.args[2].headers['Sec-Fetch-Site']
					};
				}, attachment, mockTab);

				assert.equal(result.byteLength, 2048);
				assert.equal(result.header, 'same-origin');
			});
		});

		describe('When HTTP.request returns 403', function() {
			it('should attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					
					// First request returns 403
					Zotero.HTTP.request.onFirstCall().resolves({
						response: new ArrayBuffer(0),
						status: 403,
						getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '0' : null
					});
					
					Zotero.BotBypass.passJSDetectionViaHiddenIframe
						.resolves('https://sciencedirect.com/corrected.pdf');
					
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/pdf'
					});
					
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});
		});

		describe('When attachment mime type is not provided by the translator', function () {
			it('should fetch mime type from the content type header', async function () {
				attachment = {
					url: 'https://example.com/test.html',
					referrer: 'https://example.com'
				};
				let mimeType = await background(async function (attachment, mockTab) {
					// Use the actual getContentTypeFromXHR
					Zotero.Utilities.Connector.getContentTypeFromXHR.restore();

					// mock http response with a content type header
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(1024),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'content-length') return '1024';
							if (header.toLowerCase() == 'content-type') return 'text/html; charset=utf-8';
							return null;
						}
					});
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return attachment.mimeType;
				}, attachment, mockTab);

				// attachment should have a mime type
				assert.equal(mimeType, 'text/html');
			});

			it('should guess mime type from the url if there is no content type header', async function () {
				attachment = {
					url: 'https://example.com/test.pdf',
					referrer: 'https://example.com'
				};
				let mimeType = await background(async function (attachment, mockTab) {
					// Use the actual getContentTypeFromXHR
					Zotero.Utilities.Connector.getContentTypeFromXHR.restore();

					// mock http response without a content type header
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(1024),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'content-length') return '1024';
							return null; // No content type header
						}
					});
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return attachment.mimeType;
				}, attachment, mockTab);

				// mime type should be guessed from the url
				assert.equal(mimeType, 'application/pdf');
			});
		});

		describe('When response has no Content-Length header', function() {
			it('should accept the response if content type is valid', async function() {
				const result = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(1024),
						status: 200,
						getResponseHeader: () => null
					});
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);

				assert.equal(result, 1024);
			});
		});

		describe('When response has Content-Length: 0', function() {
			it('should not accept the response', async function() {
				const error = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(0),
						status: 200,
						getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '0' : null
					});
					Zotero.BotBypass.isUrlWhitelisted.returns(false);
					try {
						await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
						return null;
					}
					catch (e) {
						return e.message;
					}
				}, attachment, mockTab);

				assert.include(error, 'Attachment download failed with HTTP status 200 (empty response)');
			});
		});

		describe('When Content-Type is application/octet-stream but translator specifies a different type', function() {
			it('should accept the response for application/pdf without attempting bot bypass', async function() {
				const outcome = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/octet-stream'
					});
					const response = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: response.byteLength,
						iframeCalled: Zotero.BotBypass.passJSDetectionViaHiddenIframe.called,
						windowPromptCalled: Zotero.BotBypass.passJSDetectionViaWindowPrompt.called
					};
				}, attachment, mockTab);

				assert.equal(outcome.byteLength, 1024);
				assert.isFalse(outcome.iframeCalled);
				assert.isFalse(outcome.windowPromptCalled);
			});

			it('should accept the response for image/jpeg without attempting bot bypass', async function() {
				attachment.mimeType = 'image/jpeg';
				const outcome = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/octet-stream'
					});
					const response = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: response.byteLength,
						iframeCalled: Zotero.BotBypass.passJSDetectionViaHiddenIframe.called,
						windowPromptCalled: Zotero.BotBypass.passJSDetectionViaWindowPrompt.called
					};
				}, attachment, mockTab);

				assert.equal(outcome.byteLength, 1024);
				assert.isFalse(outcome.iframeCalled);
				assert.isFalse(outcome.windowPromptCalled);
			});
		});


	});

	describe('BrowserAttachmentMonitor response classification', function() {
		it('ignores an HTML attachment shell while waiting for a PDF', async function() {
			const result = await background(function() {
				const htmlShell = {
					url: 'https://www.sciencedirect.com/download.pdf',
					responseHeaders: [
						{name: 'Content-Type', value: 'text/html; charset=utf-8'},
						{name: 'Content-Disposition', value: 'attachment; filename="paper.pdf"'}
					]
				};
				const pdf = {
					url: 'https://pdf.sciencedirectassets.com/paper.pdf',
					responseHeaders: [{name: 'Content-Type', value: 'application/pdf'}]
				};
				const octetStreamPDF = {
					url: 'https://example.com/download',
					responseHeaders: [
						{name: 'Content-Type', value: 'application/octet-stream'},
						{name: 'Content-Disposition', value: 'attachment; filename="paper.pdf"'}
					]
				};
				return {
					htmlAsPDF: Zotero.BrowserAttachmentMonitor._isAttachmentResponse(htmlShell, 'application/pdf'),
					htmlLegacy: Zotero.BrowserAttachmentMonitor._isAttachmentResponse(htmlShell),
					pdfAsPDF: Zotero.BrowserAttachmentMonitor._isAttachmentResponse(pdf, 'application/pdf'),
					octetStreamAsPDF: Zotero.BrowserAttachmentMonitor._isAttachmentResponse(octetStreamPDF, 'application/pdf'),
					pdfDNRHeaders: Zotero.BrowserAttachmentMonitor._getDNRResponseHeaderConditions('application/pdf'),
					legacyDNRHeaders: Zotero.BrowserAttachmentMonitor._getDNRResponseHeaderConditions()
				};
			});

			assert.isFalse(result.htmlAsPDF);
			assert.isTrue(result.htmlLegacy);
			assert.isTrue(result.pdfAsPDF);
			assert.isTrue(result.octetStreamAsPDF);
			assert.deepEqual(result.pdfDNRHeaders, [{
				header: 'content-type',
				values: ['application/pdf*']
			}]);
			assert.lengthOf(result.legacyDNRHeaders, 2);
		});
	});

	describe('saveExistingPDFToZotero', function() {
		it('fetches an authenticated PDF and sends byte-safe existing-parent metadata to the Bridge', async function() {
			const result = await background(async function() {
				const bytes = new TextEncoder().encode('%PDF-1.7\nPaperLoop authenticated PDF\n%%EOF');
				let connectorRequest = null;
				try {
					sinon.stub(Zotero.ItemSaver, '_fetchAttachment').resolves(bytes.buffer);
					sinon.stub(Zotero.Connector, 'callMethod').callsFake(async (options, data) => {
						connectorRequest = {options, data};
						return {
							hasPDF: true,
							created: true,
							attachmentKey: 'PDF-NEW-1'
						};
					});
					const response = await Zotero.ItemSaver.saveExistingPDFToZotero({
						libraryID: 1,
						itemKey: 'MISSPDF1',
						title: 'Full Text PDF',
						url: 'https://example.com/authenticated.pdf',
						mimeType: 'application/pdf'
					}, {id: 321});
					return {
						response,
						method: connectorRequest.options.method,
						timeout: connectorRequest.options.timeout,
						itemKey: connectorRequest.data.itemKey,
						size: connectorRequest.data.size,
						decoded: new TextDecoder().decode(
							Zotero.Utilities.Connector.base64ToArrayBuffer(connectorRequest.data.base64)
						)
					};
				}
				finally {
					Zotero.ItemSaver._fetchAttachment.restore();
					Zotero.Connector.callMethod.restore();
				}
			});

			assert.equal(result.method, 'paperloop/add-pdf');
			assert.equal(result.timeout, 120000);
			assert.equal(result.itemKey, 'MISSPDF1');
			assert.equal(result.size, new TextEncoder().encode(result.decoded).byteLength);
			assert.match(result.decoded, /^%PDF-/);
			assert.equal(result.response.attachmentKey, 'PDF-NEW-1');
		});

		it('rejects a non-PDF response before calling the Bridge', async function() {
			const result = await background(async function() {
				const bytes = new TextEncoder().encode('<html>login page</html>');
				try {
					sinon.stub(Zotero.ItemSaver, '_fetchAttachment').resolves(bytes.buffer);
					sinon.stub(Zotero.Connector, 'callMethod').resolves({});
					try {
						await Zotero.ItemSaver.saveExistingPDFToZotero({
							libraryID: 1,
							itemKey: 'MISSPDF1',
							url: 'https://example.com/login',
							mimeType: 'application/pdf'
						}, {id: 321});
						return {message: '', bridgeCalls: Zotero.Connector.callMethod.callCount};
					}
					catch (e) {
						return {message: e.message, bridgeCalls: Zotero.Connector.callMethod.callCount};
					}
				}
				finally {
					Zotero.ItemSaver._fetchAttachment.restore();
					Zotero.Connector.callMethod.restore();
				}
			});
			assert.include(result.message, '不是有效 PDF');
			assert.equal(result.bridgeCalls, 0);
		});

		it('surfaces the Bridge import phase and detail when Zotero rejects the PDF', async function() {
			const result = await background(async function() {
				const bytes = new TextEncoder().encode('%PDF-1.7\nPaperLoop\n%%EOF');
				try {
					sinon.stub(Zotero.ItemSaver, '_fetchAttachment').resolves(bytes.buffer);
					sinon.stub(Zotero.Connector, 'callMethod').callsFake(async () => {
						const error = new Error('Method paperloop/add-pdf failed');
						error.value = {
							error: 'PDF_IMPORT_FAILED',
							phase: 'import-attachment',
							detail: 'example import error'
						};
						throw error;
					});
					try {
						await Zotero.ItemSaver.saveExistingPDFToZotero({
							libraryID: 1,
							itemKey: 'MISSPDF1',
							url: 'https://example.com/paper.pdf',
							mimeType: 'application/pdf'
						}, {id: 321});
						return '';
					}
					catch (e) {
						return e.message;
					}
				}
				finally {
					Zotero.ItemSaver._fetchAttachment.restore();
					Zotero.Connector.callMethod.restore();
				}
			});
			assert.include(result, 'PDF_IMPORT_FAILED');
			assert.include(result, 'import-attachment');
			assert.include(result, 'example import error');
		});
	});

}); 
