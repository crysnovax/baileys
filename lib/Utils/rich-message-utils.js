/**
 * Lia@Changes 09-04-26 [WIP]
 * Adds support for tables and code blocks with richResponseMessage (wrapped inside botForwardedMessage).
 *
 * If you use or copy this code, please credit my name or project.
 */
import { randomUUID } from 'crypto';
import { BOT_RENDERING_CONFIG_METADATA, FORWARDED_AI_BOT_INFO, LEXER_REGEX } from '../Defaults/index.js';
import { LANGUAGE_KEYWORDS } from '../WABinary/constants.js';
import { CodeHighlightType, RichSubMessageType } from '../Types/RichType.js';
import { proto } from '../../WAProto/index.js';
const textEncoder = new TextEncoder();
const NOOP = new Set([]);
export const tokenizeCode = (code, language = 'javascript') => {
    const keywords = LANGUAGE_KEYWORDS[language] || NOOP;
    const blocks = [];
    LEXER_REGEX.lastIndex = 0;
    let match;
    while ((match = LEXER_REGEX.exec(code)) !== null) {
        if (match[1]) {
            blocks.push({ highlightType: CodeHighlightType.COMMENT, codeContent: match[1] });
        }
        else if (match[2]) {
            blocks.push({ highlightType: CodeHighlightType.STRING, codeContent: match[2] });
        }
        else if (match[3]) {
            blocks.push({
                highlightType: keywords.has(match[3]) ? CodeHighlightType.KEYWORD : CodeHighlightType.METHOD,
                codeContent: match[3],
            });
        }
        else if (match[4]) {
            blocks.push({
                highlightType: keywords.has(match[4]) ? CodeHighlightType.KEYWORD : CodeHighlightType.DEFAULT,
                codeContent: match[4],
            });
        }
        else if (match[5]) {
            blocks.push({ highlightType: CodeHighlightType.NUMBER, codeContent: match[5] });
        }
        else {
            blocks.push({ highlightType: CodeHighlightType.DEFAULT, codeContent: match[6] });
        }
    }
    return blocks;
};
// Lia@Changes 09-04-26 --- Inject buffer into unifiedResponse.data to support proper rendering of rich messages (ex: tables and code blocks)
export const toUnified = (submessages) =>
    ({
        response_id: randomUUID(),
        sections: submessages.map((submessage) => {
            switch (submessage.messageType) {
                case RichSubMessageType.CODE:
                    return {
                        view_model: {
                            primitive: {
                                language: submessage.codeMetadata.codeLanguage,
                                code_blocks: submessage.codeMetadata.codeBlocks.map((block) => ({ content: block.codeContent, type: CodeHighlightType[block.highlightType] })),
                                __typename: 'GenAICodeUXPrimitive'
                            },
                            __typename: 'GenAISingleLayoutViewModel'
                        }
                    };
                case RichSubMessageType.CONTENT_ITEMS:
                    return {
                        view_model: {
                            primitives: submessage.contentItemsMetadata.itemsMetadata.map((item) => {
                                const reelItem = item.reelItem
                                return {
                                    reels_url: reelItem.videoUrl,
                                    thumbnail_url: reelItem.thumbnailUrl,
                                    creator: reelItem.creator || '@itsliaaa/baileys',
                                    avatar_url: reelItem.profileIconUrl,
                                    reels_title: reelItem.title,
                                    likes_count: reelItem.likesCount || 0,
                                    shares_count: reelItem.sharesCount || 0,
                                    view_count: reelItem.viewCount || 0,
                                    reel_source: reelItem.reelSource || 'IG',
                                    is_verified: reelItem.isVerified || false,
                                    __typename: 'GenAIReelPrimitive'
                                }
                            }),
                            __typename: 'GenAIHScrollLayoutViewModel'
                        }
                    };
                case RichSubMessageType.LATEX:
                    const item = {
                        latex_expression: submessage.latexMetadata.expressions[0]?.latexExpression,
                        font_height: submessage.latexMetadata.expressions[0]?.fontHeight,
                        padding: 15,
                        latex_image: {
                            url: submessage.latexMetadata.expressions[0]?.url,
                            width: submessage.latexMetadata.expressions[0]?.width || 388,
                            height: submessage.latexMetadata.expressions[0]?.height || 160
                        }
                    };
                    return {
                        view_model: {
                            primitive: {
                                item,
                                ...item,
                                __typename: 'GenAILatexUXPrimitive'
                            },
                            __typename: 'GenAISingleLayoutViewModel'
                        }
                    };
                case RichSubMessageType.TABLE:
                    return {
                        view_model: {
                            primitive: {
                                title: submessage.tableMetadata.title,
                                rows: submessage.tableMetadata.rows.map((row) => ({ is_header: row.isHeading, cells: row.items, markdown_cells: [] })),
                                __typename: 'GenATableUXPrimitive'
                            },
                            __typename: 'GenAISingleLayoutViewModel'
                        }
                    };
                case RichSubMessageType.TEXT:
                    return {
                        view_model: {
                            primitive: { text: submessage.messageText, inline_entities: [], __typename: 'GenAIMarkdownTextUXPrimitive' },
                            __typename: 'GenAISingleLayoutViewModel'
                        }
                    };
            }
            return submessage;
        })
    });
export const prepareRichCodeBlock = ({ header, code, footer, language } = {}) => {
    language ??= 'javascript';
    const submessages = [];
    if (header) {
        submessages.push({
           messageType: RichSubMessageType.TEXT,
           messageText: header
        });
    }
    submessages.push({
        messageType: RichSubMessageType.CODE,
        codeMetadata: {
            codeLanguage: language,
            codeBlocks: tokenizeCode(code, language)
        }
    });
    if (footer) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: footer
        });
    }
    const unified = toUnified(submessages);
    return {
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: textEncoder.encode(JSON.stringify(unified))
        },
        contextInfo: FORWARDED_AI_BOT_INFO
    };
};
export const prepareRichReels = ({ header, items, footer } = {}) => {
    const submessages = [];
    if (header) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: header
        });
    }
    submessages.push({
        messageType: RichSubMessageType.CONTENT_ITEMS,
        contentItemsMetadata: {
            itemsMetadata: items.map((item) => ({ reelItem: item })),
            contentType: proto.AIRichResponseContentItemsMetadata.ContentType.CAROUSEL
        }
    });
    if (footer) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: footer
        });
    }
    const unified = toUnified(submessages);
    return {
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: textEncoder.encode(JSON.stringify(unified))
        },
        contextInfo: FORWARDED_AI_BOT_INFO
    };
};
export const prepareRichLatex = ({ header, text, expressions, footer } = {}) => {
    const submessages = [];
    if (header) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: header
        });
    }
    submessages.push({
        messageType: RichSubMessageType.LATEX,
        latexMetadata: {
            text,
            expressions
        }
    });
    if (footer) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: footer
        });
    }
    const unified = toUnified(submessages);
    return {
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: textEncoder.encode(JSON.stringify(unified))
        },
        contextInfo: FORWARDED_AI_BOT_INFO
    };
};
export const prepareRichTable = ({ header, title, table, footer } = {}) => {
    const tableRows = table.map((items, index) => ({
        isHeading: index == 0,
        items
    }));
    const submessages = [];
    if (header) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: header
        });
    }
    submessages.push({
        messageType: RichSubMessageType.TABLE,
        tableMetadata: {
            title,
            rows: tableRows
        }
    });
    if (footer) {
        submessages.push({
            messageType: RichSubMessageType.TEXT,
            messageText: footer
        });
    }
    const unified = toUnified(submessages);
    return {
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: textEncoder.encode(JSON.stringify(unified))
        },
        contextInfo: FORWARDED_AI_BOT_INFO
    };
};
export const prepareRichResponseMessage = (content) => {
    const submessages = content.map((submessage) => {
        if (submessage.text) {
            return {
                messageType: RichSubMessageType.TEXT,
                messageText: submessage.text
            };
        }
        else if (submessage.code) {
            return {
                messageType: RichSubMessageType.CODE,
                codeMetadata: {
                    codeLanguage: submessage.language,
                    codeBlocks: submessage.code
                }
            };
        }
        else if (submessage.expressions) {
            return {
                messageType: RichSubMessageType.LATEX,
                latexMetadata: {
                    text: submessage.text,
                    expressions: submessage.expressions
                }
            };
        }
        else if (submessage.items) {
            return {
                messageType: RichSubMessageType.CONTENT_ITEMS,
                contentItemsMetadata: {
                    itemsMetadata: submessage.items
                }
            };
        }
        else if (submessage.table) {
            return {
                messageType: RichSubMessageType.TABLE,
                tableMetadata: {
                    title: submessage.title,
                    rows: submessage.table
                }
            };
        }
        return submessage;
    });
    const unified = toUnified(submessages);
    return {
        submessages,
        messageType: proto.AIRichResponseMessageType.AI_RICH_RESPONSE_TYPE_STANDARD,
        unifiedResponse: {
            data: textEncoder.encode(JSON.stringify(unified))
        },
        contextInfo: FORWARDED_AI_BOT_INFO
    };
}
export const wrapToBotForwardedMessage = (message) =>
    ({
        messageContextInfo: {
            botMetadata: {
                // Lia@Note 09-04-26 --- TODO: Fill verificationMetadata field
                verificationMetadata: {},
                botRenderingConfigMetadata: BOT_RENDERING_CONFIG_METADATA
            }
        },
        botForwardedMessage: { message }
    });