import React from 'react';
import { Paperclip, Plus, Trash2 } from 'lucide-react';
import { MediaStatusChip } from '../../common/MediaStatus';
import { isMediaReady, mediaReadHref } from '../../../lib/api';

interface TaskAttachmentsCardProps {
  attachments: any[];
  onUploadFile: (file: File) => void;
  onDeleteAttachment: (attachmentId: string) => void;
}

export const TaskAttachmentsCard: React.FC<TaskAttachmentsCardProps> = ({
  attachments,
  onUploadFile,
  onDeleteAttachment,
}) => {
  return (
    <div
      id="section-files"
      className="p-4 sm:p-5 rounded-xl border border-border/80 bg-card shadow-2xs space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-bold text-foreground">Files ({attachments.length})</span>
        </div>
        <label className="cursor-pointer">
          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs font-medium hover:bg-muted/60 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Upload File
          </span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUploadFile(file);
                e.target.value = '';
              }
            }}
          />
        </label>
      </div>

      {attachments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {attachments.map((att: any) => (
            <div
              key={att.id}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors group"
            >
              {isMediaReady(att) &&
              (att.fileType?.startsWith('image/') ||
                /\.(png|jpe?g|gif|webp)$/i.test(att.fileName)) ? (
                <img
                  src={mediaReadHref(att)}
                  alt={att.fileName}
                  className="w-10 h-10 rounded-lg object-cover bg-muted shrink-0 border border-border/60"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center font-bold text-[10px] uppercase text-muted-foreground shrink-0">
                  {att.fileName.split('.').pop() || 'FILE'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {isMediaReady(att) ? (
                  <a
                    href={mediaReadHref(att)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-xs truncate hover:underline block text-foreground"
                  >
                    {att.fileName}
                  </a>
                ) : (
                  <span className="font-medium text-xs truncate block text-foreground">
                    {att.fileName}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {att.sizeBytes ? `${(att.sizeBytes / 1024).toFixed(0)} KB` : ''}
                  <MediaStatusChip att={att} />
                </span>
              </div>
              <button
                aria-label={`Delete ${att.fileName}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive transition-opacity p-1 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-muted-foreground cursor-pointer"
                onClick={() => onDeleteAttachment(att.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No files attached yet</p>
      )}
    </div>
  );
};
