import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { api, errorOf } from "@/api/client";
import { keys, useRefreshData } from "@/api/queries";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/client";

export function DeleteSongButton({ songId, label }: { songId: number; label: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const refreshData = useRefreshData();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await api(`/songs/${songId}`, { method: "DELETE" });
      setOpen(false);
      toast.success(t("deleteSong.success"));
      navigate("/songs", { replace: true });
      queryClient.removeQueries({ queryKey: keys.song(songId) });
      void refreshData();
    } catch (error) {
      const { message, params } = errorOf(error);
      toast.error(t(message, params));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} icon={<Trash2 className="size-5 text-red-700" aria-hidden />}>
        {t("song.delete")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("deleteSong.title")}
        confirmLabel={t("deleteSong.confirm")}
        onConfirm={confirm}
        pending={pending}
      >
        <p className="font-medium text-stone-900">{t("deleteSong.message", { label })}</p>
        <p>{t("deleteSong.warning")}</p>
      </ConfirmDialog>
    </>
  );
}
