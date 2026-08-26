"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UiLang = "vi" | "en";

/**
 * UI-language dictionary — labels, buttons, static copy the person reading
 * the interface sees. Deliberately separate from two other "language"
 * concepts already in this codebase, which this file does not touch:
 *
 *   - The answer's own language: /api/chat replies in whichever language the
 *     question was asked in (src/lib/prompt.ts's refusalMessage/
 *     blockedMessage/generationFailedMessage/needsDocumentMessage), because
 *     that is a product guarantee under measurement (cross-lingual recall),
 *     not a display preference. Switching the UI to English must not change
 *     what language a Vietnamese question gets answered in.
 *   - Server-side error strings returned in an API route's JSON `.error`
 *     (upload rejected, job not found, indexing failed). Those come back in
 *     Vietnamese regardless of the UI language — translating them would mean
 *     threading the UI language into every request header and rewriting
 *     every route's error branch, for messages a working app rarely shows.
 *     They stay in Vietnamese, on purpose, until that is worth doing.
 */
const dict = {
  vi: {
    theme: {
      system: "Theo hệ thống",
      dark: "Tối",
      light: "Sáng",
      describe: (label: string) => `Giao diện: ${label}. Bấm để đổi.`,
    },
    nav: {
      signIn: "Đăng nhập",
      signUp: "Đăng ký",
      signOut: "Đăng xuất",
      openApp: "Vào ứng dụng",
    },
    login: {
      signInLead: "Đăng nhập để hỏi tài liệu của bạn.",
      signUpLead: "Tạo tài khoản để bắt đầu tải tài liệu lên.",
      email: "Email",
      password: "Mật khẩu",
      submitBusy: "Đang xử lí…",
      noAccount: "Chưa có tài khoản?",
      hasAccount: "Đã có tài khoản?",
      signupConfirm: "Đã tạo tài khoản. Kiểm tra email để xác nhận, rồi đăng nhập.",
    },
    convo: {
      newChat: "+ Chat mới",
      search: "Tìm hội thoại",
      loading: "Đang tải…",
      empty: "Chưa có hội thoại nào.",
      noMatch: (q: string) => `Không tìm thấy hội thoại nào khớp "${q}".`,
      today: "Hôm nay",
      yesterday: "Hôm qua",
      last7Days: "7 ngày qua",
      older: "Cũ hơn",
      untitled: "Chat mới",
      rename: (title: string) => `Đổi tên ${title}`,
      delete: (title: string) => `Xoá ${title}`,
      renameLabel: "Tên hội thoại",
      renameAction: "Sửa",
      deleteAction: "Xoá",
      confirmDelete: (title: string) =>
        `Xoá "${title}"? Lịch sử hội thoại mất theo. Tài liệu vẫn còn và dùng được ở khung khác.`,
      deleteFailed: (msg: string) => `Không xoá được: ${msg}`,
      renameFailed: (msg: string) => `Không đổi tên được: ${msg}`,
    },
    upload: {
      heading: "Tải tài liệu",
      dropHeadline: "Kéo tài liệu hoặc ảnh vào đây, hoặc bấm để chọn",
      maxPages: (n: number) => `Tài liệu tối đa ${n} trang`,
      unsupportedKind: "Chỉ nhận PDF, DOCX, TXT, hoặc ảnh PNG / JPEG / WebP.",
      badPdf: "Không đọc được file. Kiểm tra xem đây có phải PDF hợp lệ không.",
      tooManyPages: (n: number, max: number) =>
        `Tài liệu có ${n} trang, vượt giới hạn ${max} trang. Giới hạn này đến từ hạn mức xử lí miễn phí mỗi ngày.`,
      createJobFailed: "Không tạo được tiến trình xử lí.",
      readTextFailed: "Không đọc được nội dung file.",
      indexFailed: "Không lập chỉ mục được tài liệu.",
      pageFailed: "Xử lí trang thất bại.",
      pageFailedGeneric: "Không xử lí được trang này.",
      doneImage: (chunks: number) => `Đã đọc xong ảnh thành ${chunks} đoạn. Hỏi được rồi.`,
      doneText: (pages: number, chunks: number) =>
        `Đã đọc xong ${pages} trang thành ${chunks} đoạn. Hỏi được rồi.`,
      donePdf: (pages: number, chunks: number) =>
        `Đã nạp xong ${pages} trang thành ${chunks} đoạn. Hỏi được rồi.`,
      failedGeneric: (msg?: string) =>
        msg ? `Xử lí thất bại: ${msg}` : "Xử lí thất bại vì lỗi không xác định.",
      phaseReading: "Đang đọc file…",
      phaseUploading: "Đang tải lên…",
      phaseExtractingImage: "Đang đọc nội dung ảnh…",
      phaseExtractingText: "Đang đọc nội dung file…",
      phaseExtractingPdf: (done: number, total: number) => `Đang đọc nội dung ${done}/${total} trang…`,
      phaseIndexing: "Đang lập chỉ mục…",
      keepTabVisible: "Giữ tab này hiển thị — chuyển tab sẽ tạm dừng việc đọc trang.",
    },
    docs: {
      heading: "Tài liệu trong khung này",
      loading: "Đang tải danh sách…",
      empty: "Chưa có tài liệu nào trong khung chat này.",
      detach: "Bỏ ra",
      destroy: "Xoá hẳn",
      detachLabel: (name: string) => `Bỏ ${name} khỏi khung chat này`,
      destroyLabel: (name: string) => `Xoá hẳn ${name}`,
      confirmDetach: (name: string) => `Bỏ "${name}" khỏi khung chat này? Tài liệu vẫn được giữ lại.`,
      confirmDestroy: (name: string) =>
        `Xoá hẳn "${name}"? Mất khỏi mọi khung chat, kèm các đoạn đã lập chỉ mục và file gốc.`,
      pages: (n: number) => `${n} trang · `,
    },
    scope: {
      askIn: "Hỏi trong",
      allDocs: "Tất cả tài liệu",
    },
    citations: {
      heading: "Nguồn trích dẫn",
      page: (n: number) => `trang ${n}`,
      pageRange: (a: number, b: number) => `trang ${a}–${b}`,
    },
    chat: {
      emptyTitle: "Bạn muốn hỏi gì?",
      placeholder: "Hỏi đáp tài liệu",
      questionLabel: "Câu hỏi",
      thinking: "Đang soạn câu trả lời",
      copy: "Sao chép",
      copied: "Đã sao chép",
      stop: "Dừng",
      regenerate: "Sinh lại",
      sendLabel: "Gửi câu hỏi",
      answering: "Đang trả lời",
      answeringEllipsis: "Đang trả lời…",
      streamBroken:
        "Không sinh được câu trả lời — luồng phản hồi dừng giữa chừng. Nguồn trích dẫn ở dưới vẫn là các đoạn tìm được. Thử hỏi lại.",
      degradedNote:
        "*Bước phân tích câu hỏi không chạy được, nên câu hỏi được tìm nguyên văn. Với câu hỏi tiếng Việt trên tài liệu tiếng Anh, kết quả có thể kém hơn bình thường.*",
      stoppedEarly: "Đã dừng trước khi có câu trả lời.",
      apiError: "Có lỗi khi gọi API.",
      couldNotOpenChat: "Không mở được khung chat để lưu câu hỏi.",
      resetHint: (clock: string, today: boolean, hours: number) =>
        ` Hạn mức đặt lại lúc ${clock} ${today ? "hôm nay" : "ngày mai"} — còn khoảng ${hours} giờ.`,
      suggestions: [
        "Tóm tắt tài liệu này",
        "Công thức ở trang 44 nghĩa là gì?",
        "Biểu đồ mô tả điều gì?",
        "What is semi-supervised learning?",
      ],
    },
  },
  en: {
    theme: {
      system: "System",
      dark: "Dark",
      light: "Light",
      describe: (label: string) => `Theme: ${label}. Click to change.`,
    },
    nav: {
      signIn: "Sign in",
      signUp: "Sign up",
      signOut: "Sign out",
      openApp: "Open app",
    },
    login: {
      signInLead: "Sign in to ask about your documents.",
      signUpLead: "Create an account to start uploading documents.",
      email: "Email",
      password: "Password",
      submitBusy: "Working…",
      noAccount: "Don't have an account?",
      hasAccount: "Already have an account?",
      signupConfirm: "Account created. Check your email to confirm, then sign in.",
    },
    convo: {
      newChat: "+ New chat",
      search: "Search conversations",
      loading: "Loading…",
      empty: "No conversations yet.",
      noMatch: (q: string) => `No conversation matches "${q}".`,
      today: "Today",
      yesterday: "Yesterday",
      last7Days: "Last 7 days",
      older: "Older",
      untitled: "New chat",
      rename: (title: string) => `Rename ${title}`,
      delete: (title: string) => `Delete ${title}`,
      renameLabel: "Conversation name",
      renameAction: "Rename",
      deleteAction: "Delete",
      confirmDelete: (title: string) =>
        `Delete "${title}"? Its history goes with it. Documents stay and still work in other chats.`,
      deleteFailed: (msg: string) => `Could not delete: ${msg}`,
      renameFailed: (msg: string) => `Could not rename: ${msg}`,
    },
    upload: {
      heading: "Upload a document",
      dropHeadline: "Drag a document or image here, or click to choose",
      maxPages: (n: number) => `${n} pages max`,
      unsupportedKind: "Only PDF, DOCX, TXT, or PNG / JPEG / WebP images.",
      badPdf: "Couldn't read the file. Check whether it's a valid PDF.",
      tooManyPages: (n: number, max: number) =>
        `This document has ${n} pages, over the ${max}-page limit. The limit comes from the free daily processing budget.`,
      createJobFailed: "Couldn't start processing.",
      readTextFailed: "Couldn't read the file's content.",
      indexFailed: "Couldn't index the document.",
      pageFailed: "Processing that page failed.",
      pageFailedGeneric: "Couldn't process this page.",
      doneImage: (chunks: number) => `Read the image into ${chunks} chunks. Ready to ask.`,
      doneText: (pages: number, chunks: number) =>
        `Read ${pages} pages into ${chunks} chunks. Ready to ask.`,
      donePdf: (pages: number, chunks: number) =>
        `Loaded ${pages} pages into ${chunks} chunks. Ready to ask.`,
      failedGeneric: (msg?: string) => (msg ? `Processing failed: ${msg}` : "Processing failed for an unknown reason."),
      phaseReading: "Reading the file…",
      phaseUploading: "Uploading…",
      phaseExtractingImage: "Reading the image…",
      phaseExtractingText: "Reading the file…",
      phaseExtractingPdf: (done: number, total: number) => `Reading page ${done}/${total}…`,
      phaseIndexing: "Indexing…",
      keepTabVisible: "Keep this tab visible — switching tabs pauses page reading.",
    },
    docs: {
      heading: "Documents in this chat",
      loading: "Loading the list…",
      empty: "No documents in this chat yet.",
      detach: "Remove",
      destroy: "Delete",
      detachLabel: (name: string) => `Remove ${name} from this chat`,
      destroyLabel: (name: string) => `Delete ${name} entirely`,
      confirmDetach: (name: string) => `Remove "${name}" from this chat? The document itself is kept.`,
      confirmDestroy: (name: string) =>
        `Delete "${name}" entirely? Removed from every chat, along with its index and original file.`,
      pages: (n: number) => `${n} pages · `,
    },
    scope: {
      askIn: "Ask within",
      allDocs: "All documents",
    },
    citations: {
      heading: "Sources",
      page: (n: number) => `page ${n}`,
      pageRange: (a: number, b: number) => `pages ${a}–${b}`,
    },
    chat: {
      emptyTitle: "What would you like to ask?",
      placeholder: "Ask about your documents",
      questionLabel: "Question",
      thinking: "Composing an answer",
      copy: "Copy",
      copied: "Copied",
      stop: "Stop",
      regenerate: "Regenerate",
      sendLabel: "Send question",
      answering: "Answering",
      answeringEllipsis: "Answering…",
      streamBroken:
        "No answer was generated — the response stream stopped partway. The sources below are still what was found. Try asking again.",
      degradedNote:
        "*Query analysis didn't run, so the question was searched verbatim. For a Vietnamese question over an English document, results may be worse than usual.*",
      stoppedEarly: "Stopped before an answer came back.",
      apiError: "Something went wrong calling the API.",
      couldNotOpenChat: "Couldn't open a chat to save the question in.",
      resetHint: (clock: string, today: boolean, hours: number) =>
        ` The quota resets at ${clock} ${today ? "today" : "tomorrow"} — about ${hours}h from now.`,
      suggestions: [
        "Summarise this document",
        "What does the formula on page 44 mean?",
        "What does the chart show?",
        "Sự khác biệt giữa học có giám sát và không giám sát là gì?",
      ],
    },
  },
};

// No `as const` above: it would freeze every string to its own literal type,
// so vi's "Đăng nhập" and en's "Sign in" would be different, incompatible
// types instead of both just `string` — exactly what broke the first version
// of this file. Widened, both language objects share one shape.
export type Dict = typeof dict.vi;

interface Ctx {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  t: Dict;
}

const LangContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "docubo-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("vi");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "vi" || stored === "en") setLangState(stored);
  }, []);

  function setLang(l: UiLang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: dict[lang] }}>{children}</LangContext.Provider>
  );
}

/** Throws outside a LanguageProvider on purpose — a component silently
    falling back to Vietnamese would hide the missing provider instead of
    surfacing it at the one place it went missing. */
export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang() called outside LanguageProvider");
  return ctx;
}
