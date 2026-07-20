export type OpenWAStatus = {
  ok: boolean;
  status: string;
  detail?: string;
};

export type SendTextInput = {
  sessionId: string;
  chatId: string;
  text: string;
};
