import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Text, ScrollView, Alert, Modal, Image, FlatList, Dimensions, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';
import * as FileSystem from 'expo-file-system/legacy';
import { getToolbarConfig } from '../utils/toolbarStore';
import { updateBook, getSettings } from '../utils/storage';
import * as Speech from 'expo-speech';
import { TextInput } from 'react-native';

const HTML_CONTENT = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
    <style>
      body { 
        margin: 0; 
        padding: 0; 
        background: ${COLORS.sepia}; 
        color: ${COLORS.text};
        overflow: hidden !important;
      }
      #viewer { 
        width: 100vw; 
        height: 100vh; 
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
        overflow-anchor: auto !important;
        scroll-behavior: smooth;
        will-change: scroll-position;
        touch-action: pan-y !important;
      }
    </style>
  </head>
  <body>
    <div id="viewer"></div>
    <script>
      var book;
      var rendition;

      function sendToReact(data) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }

      document.addEventListener("DOMContentLoaded", function() {
        sendToReact({ type: 'html_ready' });
      });

      document.addEventListener("message", function(event) {
        var data = JSON.parse(event.data);
        
        if(data.type === 'load') {
           var binaryStr = atob(data.base64);
           var len = binaryStr.length;
           var bytes = new Uint8Array(len);
           for (var i = 0; i < len; i++) {
               bytes[i] = binaryStr.charCodeAt(i);
           }
           
           window.currentReadingMode = data.readingMode || 'scroll';
           window.currentThemeMode = data.mode || 'light';
           
           var bookType = data.bookType || 'application/epub+zip';
           var nameLower = (data.bookName || "").toLowerCase();
           
           // Universal touch listener for parent document (PDF, DOCX, PPTX)
           var touchStartX = 0;
           var touchStartY = 0;
           document.addEventListener("touchstart", function(e) {
              var touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
              if (touch) {
                 touchStartX = touch.clientX;
                 touchStartY = touch.clientY;
              }
           });
           
           document.addEventListener("touchend", function(e) {
              var touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
              if (touch) {
                 var touchEndX = touch.clientX;
                 var touchEndY = touch.clientY;
                 
                 var distanceX = touchEndX - touchStartX;
                 var distanceY = touchEndY - touchStartY;
                 
                 if (Math.abs(distanceX) < 15 && Math.abs(distanceY) < 15) {
                    var width = window.innerWidth;
                    if (touchEndX >= width * 0.25 && touchEndX <= width * 0.75) {
                       sendToReact({ type: 'toggleMenu' });
                    } else if (touchEndX < width * 0.25) {
                       document.getElementById('viewer').scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
                    } else if (touchEndX >= width * 0.75) {
                       document.getElementById('viewer').scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
                    }
                 }
              }
           });

           function applyParentTheme() {
              var mode = window.currentThemeMode;
              if (mode === 'dark') {
                 document.body.style.backgroundColor = '#121212';
                 document.body.style.color = '#FFFFFF';
              } else if (mode === 'sepia') {
                 document.body.style.backgroundColor = '#F4ECD8';
                 document.body.style.color = '#5B4636';
              } else {
                 document.body.style.backgroundColor = '#FFFFFF';
                 document.body.style.color = '#333333';
              }
           }
           applyParentTheme();

           function escapeHtml(text) {
              return text
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
           }

           if (bookType.indexOf('pdf') !== -1 || nameLower.endsWith('.pdf')) {
              // PDF Loader using PDF.js
              var pdfjsLib = window['pdfjs-dist/build/pdf'];
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
              
              var loadingTask = pdfjsLib.getDocument({data: bytes});
              loadingTask.promise.then(function(pdf) {
                 var viewer = document.getElementById('viewer');
                 viewer.innerHTML = '';
                 
                 var containerWidth = viewer.clientWidth || window.innerWidth;
                 var renderPage = function(pageNum) {
                    if (pageNum > pdf.numPages) {
                       sendToReact({ type: 'ready' });
                       return;
                    }
                    
                    var pageContainer = document.createElement('div');
                    pageContainer.style.width = '100%';
                    pageContainer.style.maxWidth = '800px';
                    pageContainer.style.margin = '0 auto 15px auto';
                    pageContainer.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                    pageContainer.style.backgroundColor = '#FFFFFF';
                    viewer.appendChild(pageContainer);
                    
                    pdf.getPage(pageNum).then(function(page) {
                       var viewport = page.getViewport({scale: 1.5});
                       var scale = containerWidth / viewport.width;
                       var scaledViewport = page.getViewport({scale: scale * 1.5});
                                              
                       var canvas = document.createElement('canvas');
                       canvas.style.width = '100%';
                       canvas.style.display = 'block';
                       pageContainer.appendChild(canvas);
                        
                       // Extract text for TTS & Search
                       var textContainer = document.createElement('div');
                       textContainer.className = 'pdf-text';
                       textContainer.style.position = 'absolute';
                       textContainer.style.left = '-9999px';
                       textContainer.style.width = '1px';
                       textContainer.style.height = '1px';
                       textContainer.style.overflow = 'hidden';
                       pageContainer.appendChild(textContainer);
                        
                       page.getTextContent().then(function(textContent) {
                          if (textContent && textContent.items) {
                             var pageText = textContent.items.map(function(item) {
                                return item.str;
                             }).join(' ');
                             textContainer.textContent = pageText;
                          }
                       }).catch(function(e) {
                          console.log('PDF text extract error:', e);
                       });
                       
                       var context = canvas.getContext('2d');
                       canvas.height = scaledViewport.height;
                       canvas.width = scaledViewport.width;
                       
                       var renderContext = {
                          canvasContext: context,
                          viewport: scaledViewport
                       };
                       page.render(renderContext).promise.then(function() {
                          renderPage(pageNum + 1);
                       });
                    });
                 };
                 renderPage(1);
              }).catch(function(err) {
                 sendToReact({ type: 'error', message: 'PDF Load Error: ' + err.toString() });
              });

           } else if (nameLower.endsWith('.docx')) {
              // Word DOCX Parser
              JSZip.loadAsync(bytes).then(function(zip) {
                 var docXml = zip.file("word/document.xml");
                 if (docXml) {
                    docXml.async("text").then(function(xmlText) {
                       var parser = new DOMParser();
                       var xmlDoc = parser.parseFromString(xmlText, "text/xml");
                       var paragraphs = xmlDoc.getElementsByTagName("w:p");
                       var htmlOutput = "";
                       
                       for (var i = 0; i < paragraphs.length; i++) {
                          var p = paragraphs[i];
                          var runs = p.getElementsByTagName("w:r");
                          var pText = "";
                          for (var j = 0; j < runs.length; j++) {
                             var r = runs[j];
                             var texts = r.getElementsByTagName("w:t");
                             for (var k = 0; k < texts.length; k++) {
                                pText += texts[k].textContent;
                             }
                          }
                          if (pText.trim()) {
                             htmlOutput += "<p style='margin-bottom: 1.2em; line-height: 1.6; font-size: 1.1em; padding: 0 15px;'>" + escapeHtml(pText) + "</p>";
                          }
                       }
                       
                       var viewer = document.getElementById('viewer');
                       viewer.innerHTML = "<div style='padding: 20px; max-width: 800px; margin: 0 auto;'>" + htmlOutput + "</div>";
                       sendToReact({ type: 'ready' });
                    });
                 } else {
                    throw new Error("Invalid DOCX structure");
                 }
              }).catch(function(err) {
                 sendToReact({ type: 'error', message: 'DOCX Load Error: ' + err.toString() });
              });

           } else if (nameLower.endsWith('.pptx')) {
              // PowerPoint PPTX Parser
              JSZip.loadAsync(bytes).then(function(zip) {
                 var slideFiles = [];
                 zip.forEach(function(relativePath, file) {
                    if (relativePath.indexOf("ppt/slides/slide") === 0 && relativePath.endsWith(".xml")) {
                       slideFiles.push(relativePath);
                    }
                 });
                 
                 if (slideFiles.length === 0) {
                    throw new Error("No slides found in PPTX");
                 }
                 
                 slideFiles.sort(function(a, b) {
                    var numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
                    var numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
                    return numA - numB;
                 });
                 
                 var slidePromises = slideFiles.map(function(path) {
                    return zip.file(path).async("text").then(function(xmlText) {
                       var parser = new DOMParser();
                       var xmlDoc = parser.parseFromString(xmlText, "text/xml");
                       var paragraphs = xmlDoc.getElementsByTagName("a:p");
                       var slideTexts = [];
                       
                       for (var i = 0; i < paragraphs.length; i++) {
                          var p = paragraphs[i];
                          var runs = p.getElementsByTagName("a:r");
                          var pText = "";
                          for (var j = 0; j < runs.length; j++) {
                             var r = runs[j];
                             var texts = r.getElementsByTagName("a:t");
                             for (var k = 0; k < texts.length; k++) {
                                pText += texts[k].textContent;
                             }
                          }
                          if (pText.trim()) {
                             slideTexts.push(pText.trim());
                          }
                       }
                       return { texts: slideTexts };
                    });
                 });
                 
                 Promise.all(slidePromises).then(function(slides) {
                    var htmlOutput = "";
                    slides.forEach(function(slide, index) {
                       var slideContent = slide.texts.map(function(t) {
                          return "<p style='margin-bottom: 0.8em; line-height: 1.5;'>" + escapeHtml(t) + "</p>";
                       }).join("");
                       
                       htmlOutput += "<div style='background: rgba(128,128,128,0.04); border: 1px solid rgba(128,128,128,0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);'>" +
                                     "  <div style='font-size: 0.85em; font-weight: bold; color: #3a7bd5; margin-bottom: 12px; border-bottom: 1px solid rgba(128,128,128,0.1); padding-bottom: 6px;'>Slide " + (index + 1) + "</div>" +
                                     "  <div style='font-size: 1.05em;'>" + (slideContent || "<p style='color: #888; font-style: italic;'>Empty Slide</p>") + "</div>" +
                                     "</div>";
                    });
                    
                    var viewer = document.getElementById('viewer');
                    viewer.innerHTML = "<div style='padding: 20px; max-width: 800px; margin: 0 auto;'>" + htmlOutput + "</div>";
                    sendToReact({ type: 'ready' });
                 });
              }).catch(function(err) {
                 sendToReact({ type: 'error', message: 'PPTX Load Error: ' + err.toString() });
              });

           } else if (nameLower.endsWith('.doc') || nameLower.endsWith('.ppt')) {
              // Legacy binary files text extractor
              var text = "";
              var currentString = "";
              for (var i = 0; i < bytes.length; i++) {
                 var charCode = bytes[i];
                 if (charCode >= 32 && charCode <= 126) {
                    currentString += String.fromCharCode(charCode);
                 } else {
                    if (currentString.length >= 6) {
                       var cleaned = currentString.trim();
                       if (cleaned && !/^[0-9_]+$/.test(cleaned)) {
                          text += "<p style='margin-bottom: 0.8em; line-height: 1.5;'>" + escapeHtml(cleaned) + "</p>";
                       }
                    }
                    currentString = "";
                 }
              }
              var isWord = nameLower.endsWith('.doc');
              var viewer = document.getElementById('viewer');
              viewer.innerHTML = "<div style='padding: 20px; max-width: 800px; margin: 0 auto;'>" + 
                                 "  <div style='background: rgba(243,156,18,0.15); border: 1px solid #f39c12; border-radius: 8px; padding: 12px; margin-bottom: 20px; color: #d35400; font-size: 0.9em;'>" +
                                 "     <strong>Legacy Format Warning:</strong> This is a legacy binary " + (isWord ? "Word (.doc)" : "PowerPoint (.ppt)") + " file. For optimal formatting and layouts, convert it to " + (isWord ? ".docx" : ".pptx") + "." +
                                 "  </div>" +
                                 (text || "<p style='color: #888; font-style: italic;'>No readable text could be extracted.</p>") + 
                                 "</div>";
              sendToReact({ type: 'ready' });

           } else {
             // Default EPUB mode
             book = ePub(bytes.buffer);
             
             var touchStartX = 0;
             var touchStartY = 0;

             function findNavItemByHref(items, href) {
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item.href && (href.indexOf(item.href) !== -1 || item.href.indexOf(href) !== -1)) {
                        return item;
                    }
                    if (item.subitems && item.subitems.length > 0) {
                        var found = findNavItemByHref(item.subitems, href);
                        if (found) return found;
                    }
                }
                return null;
             }

             function registerHooks() {
                rendition.hooks.content.register(function(content) {
                    var doc = content.document;
                    var style = doc.createElement('style');
                    style.id = 'dynamic-theme';
                    var baseCss = " * { box-sizing: border-box !important; word-wrap: break-word !important; } body { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; overflow-anchor: auto !important; touch-action: pan-y !important; } div, p, section, article { max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; padding-right: 0 !important; } img { max-width: 100% !important; height: auto !important; display: block !important; margin: 0 auto !important; padding: 0 !important; } ";
                    if (window.currentThemeMode === 'dark') {
                        style.innerHTML = "* { color: #FFFFFF !important; background-color: transparent !important; } body { background-color: #121212 !important; } " + baseCss;
                    } else if (window.currentThemeMode === 'sepia') {
                        style.innerHTML = "* { color: #5B4636 !important; background-color: transparent !important; } body { background-color: #F4ECD8 !important; } " + baseCss;
                    } else {
                        style.innerHTML = "* { color: #333333 !important; background-color: transparent !important; } body { background-color: #FFFFFF !important; } " + baseCss;
                    }
                    doc.head.appendChild(style);

                    var imgs = doc.querySelectorAll('img');
                    imgs.forEach(function(img) {
                       img.addEventListener('load', function() {
                          var viewer = document.getElementById('viewer');
                          if (viewer && window.currentReadingMode === 'scroll') {
                             var iframes = viewer.querySelectorAll('iframe');
                             iframes.forEach(function(iframe) {
                                if (iframe.contentDocument === doc) {
                                   var actualHeight = doc.body.scrollHeight;
                                   var styleHeight = parseInt(iframe.style.height) || 0;
                                   if (actualHeight > 0 && actualHeight !== styleHeight) {
                                      var diff = actualHeight - styleHeight;
                                      iframe.style.height = actualHeight + 'px';
                                      if (iframe.offsetTop < viewer.scrollTop) {
                                         viewer.scrollTop += diff;
                                      }
                                   }
                                }
                             });
                          }
                       });
                    });
                });

                rendition.on('relocated', function(location) {
                    if (location && location.start) {
                        var percentage = (location.start.index + 1) / book.spine.length;
                        var chapterLabel = "Chapter";
                        if (book.navigation && book.navigation.toc) {
                            var currentSpineItem = book.spine.get(location.start.cfi);
                            if (currentSpineItem) {
                                var navItem = findNavItemByHref(book.navigation.toc, currentSpineItem.href);
                                if (navItem) {
                                    chapterLabel = navItem.label;
                                }
                            }
                        }
                        sendToReact({ 
                            type: 'relocated', 
                            cfi: location.start.cfi, 
                            percentage: percentage, 
                            chapter: chapterLabel 
                        });
                    }
                });

                rendition.on("touchstart", function(e) {
                   var touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
                   if (touch) {
                      touchStartX = touch.clientX;
                      touchStartY = touch.clientY;
                   }
                });

                rendition.on("touchend", function(e) {
                   var touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
                   if (touch) {
                      var touchEndX = touch.clientX;
                      var touchEndY = touch.clientY;
                      var distanceX = touchEndX - touchStartX;
                      var distanceY = touchEndY - touchStartY;
                      if (Math.abs(distanceX) < 15 && Math.abs(distanceY) < 15) {
                         var width = window.innerWidth;
                         if (touchEndX >= width * 0.25 && touchEndX <= width * 0.75) {
                            sendToReact({ type: 'toggleMenu' });
                         } else if (touchEndX < width * 0.25) {
                            if (window.currentReadingMode === 'paged') {
                               rendition.prev();
                            } else {
                               document.getElementById('viewer').scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
                            }
                         } else if (touchEndX >= width * 0.75) {
                            if (window.currentReadingMode === 'paged') {
                               rendition.next();
                            } else {
                               document.getElementById('viewer').scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
                            }
                         }
                      }
                   }
                });
             }

             var isPaged = window.currentReadingMode === 'paged';
             rendition = book.renderTo("viewer", {
                width: "100%",
                height: "100%",
                spread: "none",
                manager: isPaged ? "default" : "continuous",
                flow: isPaged ? "paginated" : "scrolled-doc"
             });
             registerHooks();

             var viewer = document.getElementById('viewer');
             if (viewer) {
                viewer.addEventListener('scroll', function() {
                   if (window.currentReadingMode !== 'scroll') return;
                   var iframes = viewer.querySelectorAll('iframe');
                   iframes.forEach(function(iframe) {
                      try {
                         var doc = iframe.contentDocument;
                         if (doc && doc.body) {
                            var actualHeight = doc.body.scrollHeight;
                            var styleHeight = parseInt(iframe.style.height) || 0;
                            if (actualHeight > 0 && Math.abs(actualHeight - styleHeight) > 3) {
                               var diff = actualHeight - styleHeight;
                               iframe.style.height = actualHeight + 'px';
                               if (iframe.offsetTop < viewer.scrollTop) {
                                  viewer.scrollTop += diff;
                               }
                            }
                         }
                      } catch(e) {}
                   });
                });
             }

             var initialLocation = data.lastLocation || undefined;
             rendition.display(initialLocation).then(function() {
                sendToReact({ type: 'ready' });
             }).catch(function(err) {
                sendToReact({ type: 'error', message: err.toString() });
             });

             book.loaded.navigation.then(function(nav) {
                var chaptersData = [];
                var extractToc = function(items) {
                   (items || []).forEach(function(item) {
                      chaptersData.push({ id: item.id, label: item.label, href: item.href });
                      if (item.subitems && item.subitems.length > 0) {
                         extractToc(item.subitems);
                      }
                   });
                };
                extractToc(nav.toc);
                sendToReact({ type: 'toc', chapters: chaptersData });
             });

             book.ready.then(function() {
                var manifest = book.packaging.manifest;
                var imageAssets = [];
                for(var key in manifest) {
                   if(manifest[key].type && manifest[key].type.indexOf('image/') === 0) {
                      imageAssets.push(manifest[key]);
                   }
                }
                var promises = imageAssets.map(function(item) {
                   var url = book.path ? book.path.resolve(item.href) : item.href;
                   return book.archive.getBlob(url).then(function(blob) {
                      return new Promise(function(resolve, reject) {
                         var reader = new FileReader();
                         reader.onloadend = function() { resolve(reader.result); };
                         reader.onerror = reject;
                         reader.readAsDataURL(blob);
                      });
                   }).catch(function(err) { 
                      sendToReact({ type: 'error', message: 'Image Extract Error: ' + url + ' - ' + err.toString() });
                      return null; 
                   });
                });
                Promise.all(promises).then(function(dataUris) {
                   var validUrls = dataUris.filter(function(uri) { return uri !== null; });
                   sendToReact({ type: 'images', urls: validUrls });
                });
             });
           }
         } else if (data.type === 'theme') {
            window.currentThemeMode = data.mode;
            var body = document.body;
            if (body) {
                if (data.mode === 'dark') {
                   body.style.backgroundColor = '#121212';
                   body.style.color = '#FFFFFF';
                } else if (data.mode === 'sepia') {
                   body.style.backgroundColor = '#F4ECD8';
                   body.style.color = '#5B4636';
                } else {
                   body.style.backgroundColor = '#FFFFFF';
                   body.style.color = '#333333';
                }
            }
            if (rendition) {
                var contents = rendition.getContents();
                contents.forEach(function(content) {
                    var doc = content.document;
                    var style = doc.getElementById('dynamic-theme');
                    if (!style) {
                        style = doc.createElement('style');
                        style.id = 'dynamic-theme';
                        doc.head.appendChild(style);
                    }
                    var baseCss = " * { box-sizing: border-box !important; word-wrap: break-word !important; } body { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; overflow-anchor: auto !important; touch-action: pan-y !important; } div, p, section, article { max-width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; padding-left: 0 !important; padding-right: 0 !important; } img { max-width: 100% !important; height: auto !important; display: block !important; margin: 0 auto !important; padding: 0 !important; } ";
                    if (data.mode === 'dark') {
                        style.innerHTML = "* { color: #FFFFFF !important; background-color: transparent !important; } body { background-color: #121212 !important; } " + baseCss;
                    } else if (data.mode === 'sepia') {
                        style.innerHTML = "* { color: #5B4636 !important; background-color: transparent !important; } body { background-color: #F4ECD8 !important; } " + baseCss;
                    } else {
                        style.innerHTML = "* { color: #333333 !important; background-color: transparent !important; } body { background-color: #FFFFFF !important; } " + baseCss;
                    }
                });
            }
         } else if (data.type === 'readingMode') {
            window.currentReadingMode = data.mode;
            if (rendition) {
               var lastCfi = rendition.location ? rendition.location.start.cfi : undefined;
               rendition.destroy();
               var isPaged = data.mode === 'paged';
               rendition = book.renderTo("viewer", {
                  width: "100%",
                  height: "100%",
                  spread: "none",
                  manager: isPaged ? "default" : "continuous",
                  flow: isPaged ? "paginated" : "scrolled-doc"
               });
               registerHooks();

               // Re-register Scroll-based dynamic layout mismatch corrector
               var viewer = document.getElementById('viewer');
               if (viewer) {
                  viewer.addEventListener('scroll', function() {
                     if (window.currentReadingMode !== 'scroll') return;
                     var iframes = viewer.querySelectorAll('iframe');
                     iframes.forEach(function(iframe) {
                        try {
                           var doc = iframe.contentDocument;
                           if (doc && doc.body) {
                              var actualHeight = doc.body.scrollHeight;
                              var styleHeight = parseInt(iframe.style.height) || 0;
                              if (actualHeight > 0 && Math.abs(actualHeight - styleHeight) > 3) {
                                 var diff = actualHeight - styleHeight;
                                 iframe.style.height = actualHeight + 'px';
                                 if (iframe.offsetTop < viewer.scrollTop) {
                                    viewer.scrollTop += diff;
                                 }
                              }
                           }
                        } catch(e) {}
                     });
                  });
               }

               rendition.display(lastCfi);
            }
        } else if (data.type === 'fontsize') {
           if(rendition) {
              rendition.themes.fontSize(data.size + "%");
           }
        } else if (data.type === 'goto') {
           if(rendition) {
              var target = data.href;
              rendition.display(target).catch(function(err){
                 var spineItems = book.spine.items;
                 var found = false;
                 for(var i = 0; i < spineItems.length; i++) {
                     if (spineItems[i].href && spineItems[i].href.indexOf(target) !== -1) {
                         rendition.display(spineItems[i].href);
                         found = true;
                         break;
                     }
                 }
                 if(!found) {
                     var baseHref = target.split('#')[0];
                     for(var i = 0; i < spineItems.length; i++) {
                         if (spineItems[i].href && spineItems[i].href.indexOf(baseHref) !== -1) {
                             rendition.display(spineItems[i].href);
                             found = true;
                             break;
                         }
                     }
                     if (!found) {
                         sendToReact({ type: 'error', message: "Jump Error: Section not found." });
                     }
                 }
              });
           }
         } else if (data.type === 'autoscroll') {
           if (window.autoScrollFrame) { cancelAnimationFrame(window.autoScrollFrame); window.autoScrollFrame = null; }
           if (data.action === 'start') {
              var speed = data.speed || 1;
              function step() {
                  var viewer = document.getElementById('viewer');
                  if (viewer) viewer.scrollBy(0, speed);
                  window.autoScrollFrame = requestAnimationFrame(step);
              }
              window.autoScrollFrame = requestAnimationFrame(step);
           }
         } else if (data.type === 'tts_extract') {
             var text = "";
             if (rendition) {
                 var contents = rendition.getContents();
                 if (contents.length > 0 && contents[0].document && contents[0].document.body) {
                     text = contents[0].document.body.innerText || contents[0].document.body.textContent;
                 }
             }
             
             // Fallback: check all iframes inside viewer
             if (!text || !text.trim()) {
                 var viewer = document.getElementById('viewer');
                 if (viewer) {
                     var iframes = viewer.querySelectorAll('iframe');
                     if (iframes.length > 0) {
                         for (var i = 0; i < iframes.length; i++) {
                             try {
                                 var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                                 if (doc && doc.body) {
                                     var iframeText = doc.body.innerText || doc.body.textContent;
                                     if (iframeText) {
                                         text += " " + iframeText;
                                     }
                                 }
                             } catch (e) {
                                 console.log("Iframe text extract error:", e);
                             }
                         }
                     }
                 }
             }

             // Final fallback: check viewer text (PDF, DOCX, PPTX, etc.)
             if (!text || !text.trim()) {
                 var viewer = document.getElementById('viewer');
                 if (viewer) {
                     text = viewer.innerText || viewer.textContent;
                 }
             }

             var sentences = [];
             if (text && text.trim()) {
                 sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
             }
             
             sendToReact({ 
                 type: 'tts_data', 
                 paragraphs: sentences.map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; }) 
             });
         } else if (data.type === 'search') {
            var query = data.query.toLowerCase();
            var results = [];
            if (book) {
                var spineItems = book.spine.spineItems;
                var i = 0;
                function searchNext() {
                    if (i >= spineItems.length) {
                        sendToReact({ type: 'search_results', results: results });
                        return;
                    }
                    var item = spineItems[i];
                    item.load(book.load.bind(book)).then(function(doc) {
                        var text = "";
                        if (typeof doc === 'string') {
                            text = doc.replace(/<[^>]+>/g, ' ').toLowerCase();
                        } else {
                            text = (doc.body || doc).textContent.toLowerCase();
                          }
                          var idx = text.indexOf(query);
                          while (idx !== -1) {
                              var snippet = text.substring(Math.max(0, idx - 40), Math.min(text.length, idx + 40));
                              results.push({ cfi: item.href, snippet: "..." + snippet + "..." });
                              idx = text.indexOf(query, idx + 1);
                          }
                          i++;
                          setTimeout(searchNext, 10);
                      }).catch(function() {
                          i++;
                          setTimeout(searchNext, 10);
                      });
                  }
                  searchNext();
            } else {
                var viewer = document.getElementById('viewer');
                if (viewer) {
                    var text = (viewer.innerText || viewer.textContent).toLowerCase();
                    var idx = text.indexOf(query);
                    while (idx !== -1) {
                        var snippet = text.substring(Math.max(0, idx - 40), Math.min(text.length, idx + 40));
                        results.push({ cfi: "", snippet: "..." + snippet + "..." });
                        idx = text.indexOf(query, idx + 1);
                    }
                }
                sendToReact({ type: 'search_results', results: results });
            }
         }
         });
         
         // Also support iOS postMessage
         window.addEventListener("message", function(event) {
           document.dispatchEvent(new MessageEvent("message", { data: event.data }));
         });
       </script>
     </body>
     </html>
   `;

const WEBVIEW_SOURCE = { html: HTML_CONTENT };

export default function ReaderScreen({ route, navigation }) {
  const { book } = route.params;
  const webviewRef = useRef(null);
  const base64DataRef = useRef(null);
  const isWebviewHtmlReady = useRef(false);
  const [loading, setLoading] = useState(true);
  const [toolbarConfig, setToolbarConfig] = useState([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  
  // Phase 1 Features
  const [themeMode, setThemeMode] = useState('dark');
  const [fontSize, setFontSize] = useState(100);
  const [chapters, setChapters] = useState([]);
  const [chaptersVisible, setChaptersVisible] = useState(false);
  const [images, setImages] = useState([]);
  const [imagesVisible, setImagesVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

  // MoonReader States
  const [readingMode, setReadingMode] = useState('scroll');
  const [currentChapterName, setCurrentChapterName] = useState('');
  const [readingPercentage, setReadingPercentage] = useState(0);
  const [currentTime, setCurrentTime] = useState('');

  // Phase 2 Features
  const [autoScrollVisible, setAutoScrollVisible] = useState(false);
  const [autoScrollPlaying, setAutoScrollPlaying] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(1);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ttsVisible, setTtsVisible] = useState(false);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsParagraphs, setTtsParagraphs] = useState([]);
  const [currentTtsIndex, setCurrentTtsIndex] = useState(0);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsPitch, setTtsPitch] = useState(1.0);

  const quickActions = toolbarConfig.slice(0, 4);
  const moreActions = toolbarConfig.slice(4);

  const insets = useSafeAreaInsets();
  const menuAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: menuVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [menuVisible]);

  useEffect(() => {
    const updateTime = () => {
       const now = new Date();
       let hours = now.getHours();
       const minutes = now.getMinutes().toString().padStart(2, '0');
       const ampm = hours >= 12 ? 'PM' : 'AM';
       hours = hours % 12 || 12;
       setCurrentTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const animatedHeaderStyle = {
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-100, 0],
        }),
      },
    ],
  };

  const animatedBottomToolbarStyle = {
    opacity: menuAnim,
    transform: [
      {
        translateY: menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [150, 0],
        }),
      },
    ],
  };

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    const initReader = async () => {
      const settings = await getSettings();
      if (settings) {
        if (settings.readingTheme) setThemeMode(settings.readingTheme);
        if (settings.defaultFontSize) setFontSize(settings.defaultFontSize);
        if (settings.readingMode) setReadingMode(settings.readingMode);
      }
      loadBookData();
      loadToolbar();
    };
    initReader();
  }, []);

  const loadToolbar = async () => {
    const config = await getToolbarConfig();
    if (!config.find(c => c.id === 'images')) config.push({ id: 'images', name: 'Image Gallery', icon: 'images-outline', enabled: true });
    if (!config.find(c => c.id === 'autoscroll')) config.push({ id: 'autoscroll', name: 'Auto Scroll', icon: 'swap-vertical-outline', enabled: true });
    if (!config.find(c => c.id === 'tts')) config.push({ id: 'tts', name: 'Text-to-Speech', icon: 'volume-high-outline', enabled: true });
    if (!config.find(c => c.id === 'search')) config.push({ id: 'search', name: 'Search Book', icon: 'search-outline', enabled: true });
    if (!config.find(c => c.id === 'mode')) config.push({ id: 'mode', name: 'Reading Mode', icon: 'book-outline', enabled: true });
    setToolbarConfig(config.filter(item => item.enabled));
  };

  const sendBookToWebview = () => {
    if (webviewRef.current && base64DataRef.current && isWebviewHtmlReady.current) {
      webviewRef.current.postMessage(JSON.stringify({
        type: 'load',
        base64: base64DataRef.current,
        lastLocation: book.lastLocation,
        mode: themeMode,
        readingMode: readingMode,
        bookType: book.type || (book.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/epub+zip'),
        bookName: book.name
      }));
    }
  };

  const loadBookData = async () => {
    try {
      const base64Data = await FileSystem.readAsStringAsync(book.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      base64DataRef.current = base64Data;
      sendBookToWebview();
    } catch (err) {
      console.error("Error reading book file:", err);
      setLoading(false);
    }
  };

  const onMessage = (event) => {
    const data = JSON.parse(event.nativeEvent.data);
    if (data.type === 'html_ready') {
      isWebviewHtmlReady.current = true;
      sendBookToWebview();
    } else if (data.type === 'ready') {
      setLoading(false);
    } else if (data.type === 'error') {
      console.error("EPUBJS Error:", data.message);
      setLoading(false);
    } else if (data.type === 'toggleMenu') {
      setMenuVisible(prev => !prev);
    } else if (data.type === 'toc') {
      setChapters(data.chapters);
    } else if (data.type === 'images') {
      setImages(data.urls);
    } else if (data.type === 'tts_data') {
      setTtsParagraphs(data.paragraphs);
      setCurrentTtsIndex(0);
      setTtsPlaying(true);
      playTts(data.paragraphs, 0);
    } else if (data.type === 'search_results') {
      setSearchResults(data.results);
      setIsSearching(false);
    } else if (data.type === 'relocated') {
      updateBook({ ...book, lastLocation: data.cfi, progress: data.percentage });
    }
  };

  const playTts = (paragraphs, index, rateOverride = ttsSpeed, pitchOverride = ttsPitch) => {
    if (!paragraphs || paragraphs.length === 0) {
      Alert.alert('Text-to-Speech', 'No readable text could be extracted from this page.');
      setTtsPlaying(false);
      return;
    }
    if (index >= paragraphs.length) {
      setTtsPlaying(false);
      return;
    }
    try {
      Speech.speak(paragraphs[index], {
        rate: rateOverride,
        pitch: pitchOverride,
        onDone: () => {
          setCurrentTtsIndex(index + 1);
          playTts(paragraphs, index + 1, rateOverride, pitchOverride);
        },
        onError: (err) => {
          console.log('TTS playback callback error:', err);
          setTtsPlaying(false);
        }
      });
    } catch (e) {
      console.log('TTS speak synchronous error:', e);
      Alert.alert('TTS Error', 'Failed to start text-to-speech engine: ' + e.message);
      setTtsPlaying(false);
    }
  };

  const stopTts = () => {
    Speech.stop();
    setTtsPlaying(false);
  };

  const handleTtsSettingChange = (type, action) => {
      let newVal;
      if (type === 'speed') {
          newVal = action === 'up' ? Math.min(2.0, ttsSpeed + 0.25) : Math.max(0.5, ttsSpeed - 0.25);
          setTtsSpeed(newVal);
      } else {
          newVal = action === 'up' ? Math.min(2.0, ttsPitch + 0.1) : Math.max(0.5, ttsPitch - 0.1);
          setTtsPitch(newVal);
      }
      
      if (ttsPlaying) {
          Speech.stop();
          setTimeout(() => {
              playTts(ttsParagraphs, currentTtsIndex, type === 'speed' ? newVal : ttsSpeed, type === 'pitch' ? newVal : ttsPitch);
          }, 100);
      }
  };

  useEffect(() => {
    if (webviewRef.current && !loading) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'theme', mode: themeMode }));
    }
  }, [themeMode, loading]);

  useEffect(() => {
    if (webviewRef.current && !loading) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'fontsize', size: fontSize }));
    }
  }, [fontSize, loading]);

  const handleButtonPress = (btn) => {
    setMoreMenuVisible(false);
    if (btn.id === 'customize') {
      navigation.navigate('CustomizeToolbar', { onSave: (newConfig) => {
         setToolbarConfig(newConfig.filter(i => i.enabled));
      }});
    } else if (btn.id === 'daynight') {
      setThemeMode(prev => prev === 'light' ? 'dark' : (prev === 'dark' ? 'sepia' : 'light'));
    } else if (btn.id === 'fontsize') {
      Alert.alert('Font Size', 'Adjust font size', [
        { text: 'A-', onPress: () => setFontSize(prev => Math.max(50, prev - 25)) },
        { text: 'A+', onPress: () => setFontSize(prev => Math.min(200, prev + 25)) },
        { text: 'Cancel', style: 'cancel' }
      ]);
    } else if (btn.id === 'chapters') {
      setChaptersVisible(true);
    } else if (btn.id === 'images') {
      setImagesVisible(true);
    } else if (btn.id === 'autoscroll') {
      setAutoScrollVisible(true);
    } else if (btn.id === 'tts') {
      setTtsVisible(true);
      if (webviewRef.current) webviewRef.current.postMessage(JSON.stringify({ type: 'tts_extract' }));
    } else if (btn.id === 'search') {
      setSearchVisible(true);
    } else if (btn.id === 'mode') {
      const nextMode = readingMode === 'scroll' ? 'paged' : 'scroll';
      setReadingMode(nextMode);
      const { updateSettings } = require('../utils/storage');
      updateSettings({ readingMode: nextMode });
      if (webviewRef.current) {
         webviewRef.current.postMessage(JSON.stringify({ type: 'readingMode', mode: nextMode }));
      }
      Alert.alert('Mode Switched', `Switched to ${nextMode === 'scroll' ? 'Continuous Scroll' : 'Page Flip'} mode.`);
    } else {
      Alert.alert(btn.name, `${btn.name} feature is coming soon!`);
      console.log(btn.name + ' pressed');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: themeMode === 'dark' ? '#121212' : (themeMode === 'sepia' ? COLORS.sepia : '#FFF') }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={[styles.readerContainer, themeMode === 'dark' && { backgroundColor: '#121212' }, { paddingBottom: 24 }]}>
          <WebView
            ref={webviewRef}
            source={WEBVIEW_SOURCE}
            originWhitelist={['*']}
            onMessage={onMessage}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            nestedScrollEnabled={true}
            androidHardwareAccelerationDisabled={false}
            overScrollMode="never"
          />
          
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Opening book...</Text>
            </View>
          )}

          <View style={[styles.miniStatusBar, { backgroundColor: themeMode === 'dark' ? '#121212' : (themeMode === 'sepia' ? COLORS.sepia : '#FFF'), borderTopColor: themeMode === 'dark' ? '#2A2A2A' : '#E0E0E0' }]}>
             <Text style={[styles.miniStatusText, { color: themeMode === 'dark' ? '#666' : '#999', flex: 1 }]} numberOfLines={1}>
                {currentChapterName || 'Reading'}
             </Text>
             <Text style={[styles.miniStatusText, { color: themeMode === 'dark' ? '#666' : '#999', marginHorizontal: 15 }]}>
                {readingPercentage}%
             </Text>
             <Text style={[styles.miniStatusText, { color: themeMode === 'dark' ? '#666' : '#999' }]}>
                {currentTime}
             </Text>
          </View>
        </View>
      </SafeAreaView>

      <Animated.View 
        style={[
          styles.header, 
          { paddingTop: Math.max(20, insets.top) },
          animatedHeaderStyle
        ]}
        pointerEvents={menuVisible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.card} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {book.customTitle || book.name.replace(/\.epub$/i, '').replace(/\.pdf$/i, '')}
        </Text>
      </Animated.View>

      <Animated.View 
        style={[
          styles.bottomToolbar, 
          { 
            height: 80 + insets.bottom,
            paddingBottom: insets.bottom 
          },
          animatedBottomToolbarStyle
        ]}
        pointerEvents={menuVisible ? 'auto' : 'none'}
      >
        <View style={styles.toolbarRow}>
          {quickActions.map((btn) => (
            <TouchableOpacity 
              key={btn.id} 
              style={styles.toolbarButton}
              onPress={() => handleButtonPress(btn)}
            >
              <Ionicons name={btn.icon} size={24} color={COLORS.card} />
              <Text style={styles.toolbarButtonText} numberOfLines={1}>{btn.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
            style={styles.toolbarButton}
            onPress={() => setMoreMenuVisible(true)}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.card} />
            <Text style={styles.toolbarButtonText} numberOfLines={1}>More</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Modal
        visible={moreMenuVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMoreMenuVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMoreMenuVisible(false)}>
          <View style={styles.moreMenuContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.moreMenuHeader}>
              <Text style={styles.moreMenuTitle}>More Options</Text>
              <TouchableOpacity onPress={() => setMoreMenuVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.moreMenuGrid}>
              {moreActions.map((btn) => (
                <TouchableOpacity 
                  key={btn.id} 
                  style={styles.moreMenuButton}
                  onPress={() => handleButtonPress(btn)}
                >
                  <Ionicons name={btn.icon} size={28} color={COLORS.text} />
                  <Text style={styles.moreMenuButtonText} numberOfLines={2}>{btn.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal visible={chaptersVisible} animationType="slide" onRequestClose={() => setChaptersVisible(false)}>
        <SafeAreaView style={[styles.container, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <View style={[styles.header, themeMode === 'dark' && { backgroundColor: '#1F1F1F' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setChaptersVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.card} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Table of Contents</Text>
          </View>
          <ScrollView>
            {chapters.map((chap, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.chapterItem, themeMode === 'dark' && { borderBottomColor: '#333' }]}
                onPress={() => {
                  setChaptersVisible(false);
                  if (webviewRef.current) {
                    webviewRef.current.postMessage(JSON.stringify({ type: 'goto', href: chap.href }));
                  }
                }}
              >
                <Text style={[styles.chapterText, themeMode === 'dark' && { color: '#FFF' }]}>{chap.label ? chap.label.trim() : 'Chapter ' + (idx + 1)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={imagesVisible} animationType="slide" onRequestClose={() => setImagesVisible(false)}>
        <SafeAreaView style={[styles.container, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <View style={[styles.header, themeMode === 'dark' && { backgroundColor: '#1F1F1F' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setImagesVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.card} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Image Gallery</Text>
          </View>
          {images.length === 0 ? (
            <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
              <Text style={{color: COLORS.text}}>No images found in this book.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.imageGrid}>
              {images.map((imgUrl, idx) => (
                <TouchableOpacity key={idx} style={styles.imageWrapper} onPress={() => setSelectedImageIndex(idx)}>
                  <Image source={{ uri: imgUrl }} style={styles.galleryImage} resizeMode="contain" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
      <Modal visible={selectedImageIndex !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedImageIndex(null)}>
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.95)'}}>
          <SafeAreaView style={{flex: 1}}>
              <TouchableOpacity style={{position: 'absolute', top: 20, right: 20, zIndex: 10}} onPress={() => setSelectedImageIndex(null)}>
                <Ionicons name="close-circle" size={36} color="#FFFFFF" />
              </TouchableOpacity>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={selectedImageIndex !== null ? selectedImageIndex : 0}
                getItemLayout={(data, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                  <View style={{width: windowWidth, height: '100%', justifyContent: 'center', alignItems: 'center'}}>
                    <Image source={{ uri: item }} style={{width: '100%', height: '90%'}} resizeMode="contain" />
                  </View>
                )}
              />
          </SafeAreaView>
        </View>
      </Modal>

      {/* Auto Scroll Overlay */}
      {autoScrollVisible && (
        <View style={{position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: COLORS.card, padding: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', zIndex: 100}}>
          <TouchableOpacity onPress={() => { setAutoScrollVisible(false); setAutoScrollPlaying(false); webviewRef.current.postMessage(JSON.stringify({ type: 'autoscroll', action: 'stop' })); }}>
            <Ionicons name="close-circle" size={32} color={COLORS.text} style={{marginRight: 10}} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            const newPlaying = !autoScrollPlaying;
            setAutoScrollPlaying(newPlaying);
            webviewRef.current.postMessage(JSON.stringify({ type: 'autoscroll', action: newPlaying ? 'start' : 'stop', speed: autoScrollSpeed }));
          }}>
            <Ionicons name={autoScrollPlaying ? "pause-circle" : "play-circle"} size={48} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            const newSpeed = autoScrollSpeed === 1 ? 1.5 : (autoScrollSpeed === 1.5 ? 2 : 1);
            setAutoScrollSpeed(newSpeed);
            if (autoScrollPlaying) webviewRef.current.postMessage(JSON.stringify({ type: 'autoscroll', action: 'start', speed: newSpeed }));
          }} style={{marginLeft: 10, padding: 10, backgroundColor: COLORS.background, borderRadius: 10}}>
            <Text style={{color: COLORS.text, fontWeight: 'bold'}}>{autoScrollSpeed}x</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TTS Overlay */}
      {ttsVisible && (
        <View style={{position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: COLORS.card, padding: 15, borderRadius: 20, width: '90%', zIndex: 100, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
              <Text style={{color: COLORS.text, fontWeight: 'bold', fontSize: 18}}>Text to Speech</Text>
              <TouchableOpacity onPress={() => { setTtsVisible(false); stopTts(); }}>
                <Ionicons name="close-circle" size={32} color={COLORS.text} />
              </TouchableOpacity>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'center', marginBottom: 15}}>
              <TouchableOpacity onPress={() => {
                if (ttsPlaying) { 
                    Speech.stop(); 
                    setTtsPlaying(false); 
                } else { 
                    setTtsPlaying(true); 
                    playTts(ttsParagraphs, currentTtsIndex); 
                }
              }}>
                <Ionicons name={ttsPlaying ? "pause-circle" : "play-circle"} size={64} color={COLORS.primary} />
              </TouchableOpacity>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
              <Text style={{color: COLORS.text, width: 60}}>Speed</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('speed', 'down')}>
                  <Ionicons name="remove-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={{color: COLORS.text, width: 50, textAlign: 'center'}}>{ttsSpeed.toFixed(2)}x</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('speed', 'up')}>
                  <Ionicons name="add-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{color: COLORS.text, width: 60}}>Pitch</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('pitch', 'down')}>
                  <Ionicons name="remove-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={{color: COLORS.text, width: 50, textAlign: 'center'}}>{ttsPitch.toFixed(1)}</Text>
              <TouchableOpacity onPress={() => handleTtsSettingChange('pitch', 'up')}>
                  <Ionicons name="add-circle-outline" size={32} color={COLORS.primary} />
              </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search Modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={() => setSearchVisible(false)}>
        <SafeAreaView style={[styles.container, themeMode === 'dark' && { backgroundColor: '#121212' }]}>
          <View style={[styles.header, themeMode === 'dark' && { backgroundColor: '#1F1F1F' }]}>
            <TouchableOpacity style={styles.backButton} onPress={() => setSearchVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.card} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Search Book</Text>
          </View>
          <View style={{padding: 10, flexDirection: 'row'}}>
            <TextInput 
              style={{flex: 1, backgroundColor: COLORS.card, color: COLORS.text, padding: 10, borderRadius: 10}} 
              placeholder="Search entire book..." 
              placeholderTextColor="#888"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => {
                 if(searchQuery.trim().length > 2) {
                    setIsSearching(true);
                    setSearchResults([]);
                    webviewRef.current.postMessage(JSON.stringify({ type: 'search', query: searchQuery }));
                 }
              }}
            />
          </View>
          {isSearching ? (
             <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator size="large" color={COLORS.primary}/></View>
          ) : (
             <FlatList
                data={searchResults}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({item}) => (
                   <TouchableOpacity style={{padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border}} onPress={() => {
                       setSearchVisible(false);
                       webviewRef.current.postMessage(JSON.stringify({ type: 'goto', href: item.cfi }));
                   }}>
                       <Text style={{color: COLORS.text}}>{item.snippet}</Text>
                   </TouchableOpacity>
                )}
             />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIZES.medium,
    backgroundColor: COLORS.primary,
  },
  backButton: {
    marginRight: SIZES.medium,
  },
  headerTitle: {
    flex: 1,
    fontSize: SIZES.large,
    fontWeight: 'bold',
    color: COLORS.card,
  },
  readerContainer: {
    flex: 1,
    backgroundColor: COLORS.sepia,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.sepia,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SIZES.medium,
    fontSize: SIZES.medium,
    color: COLORS.text,
  },
  bottomToolbar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    height: 80,
    backgroundColor: COLORS.primary,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  toolbarScroll: {
    paddingHorizontal: SIZES.small,
    alignItems: 'center',
  },
  toolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
    marginHorizontal: 4,
  },
  toolbarButtonText: {
    color: COLORS.card,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  toolbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
    height: 80,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  moreMenuContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: SIZES.large,
    borderTopRightRadius: SIZES.large,
    padding: SIZES.medium,
    maxHeight: '70%',
  },
  moreMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.medium,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SIZES.small,
  },
  moreMenuTitle: {
    fontSize: SIZES.large,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  moreMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: SIZES.extraLarge,
  },
  moreMenuButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: SIZES.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SIZES.medium,
    padding: SIZES.small,
  },
  moreMenuButtonText: {
    color: COLORS.text,
    fontSize: 12,
    marginTop: SIZES.small,
    textAlign: 'center',
  },
  chapterItem: {
    padding: SIZES.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chapterText: {
    fontSize: SIZES.medium,
    color: COLORS.text,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SIZES.small,
  },
  imageWrapper: {
    width: '48%',
    aspectRatio: 1,
    margin: '1%',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.small,
    overflow: 'hidden',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  miniStatusBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderTopWidth: 1,
    zIndex: 5,
  },
  miniStatusText: {
    fontSize: 10,
    fontWeight: '500',
  }
});
