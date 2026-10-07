import { History } from "lucide-react";
import { useSearchParams } from "react-router";
import { useActivity, useCategories, useCurrentUser, useUsers } from "@/api/queries";
import { AuditList } from "@/components/activity/audit-list";
import { CategoryManager } from "@/components/categories/category-manager";
import { DisplayNameForm, PasswordForm } from "@/components/settings/settings-forms";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { UserManager } from "@/components/users/user-manager";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeletons";
import { Pagination } from "@/components/ui/pagination";
import { LoadError } from "@/components/ui/query-state";
import { useI18n } from "@/lib/i18n/client";
import { useTitle } from "@/lib/title";
import { parseWholeNumber } from "@/lib/utils";

export function CategoriesPage() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const categories = useCategories();
  useTitle(t("categories.title"));

  return (
    <>
      <PageHeader title={t("categories.title")} description={t("categories.subtitle")} />
      {categories.isPending ? (
        <PageSkeleton />
      ) : categories.isError ? (
        <LoadError error={categories.error} retry={() => categories.refetch()} />
      ) : (
        <CategoryManager isAdmin={user.isAdmin} categories={categories.data} />
      )}
    </>
  );
}

export function UsersPage() {
  const currentUser = useCurrentUser();
  const { t } = useI18n();
  const users = useUsers();
  useTitle(t("users.title"));

  return (
    <>
      <PageHeader title={t("users.title")} description={t("users.subtitle")} />
      {users.isPending ? (
        <PageSkeleton />
      ) : users.isError ? (
        <LoadError error={users.error} retry={() => users.refetch()} />
      ) : (
        <UserManager currentUserId={currentUser.id} users={users.data} />
      )}
    </>
  );
}

const ACTIVITY_PAGE_SIZE = 50;

export function ActivityPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const page = Math.max(1, parseWholeNumber(searchParams.get("page")) ?? 1);
  const activity = useActivity(page);
  useTitle(t("activity.title"));

  return (
    <>
      <PageHeader title={t("activity.title")} description={t("activity.subtitle")} />
      {activity.isPending ? (
        <PageSkeleton />
      ) : activity.isError ? (
        <LoadError error={activity.error} retry={() => activity.refetch()} />
      ) : activity.data.items.length > 0 ? (
        <>
          <Card className="p-5">
            <AuditList entries={activity.data.items} />
          </Card>
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(activity.data.total / ACTIVITY_PAGE_SIZE))}
            t={t}
            hrefFor={(target) => (target > 1 ? `/activity?page=${target}` : "/activity")}
          />
        </>
      ) : (
        <EmptyState icon={<History />} title={t("activity.empty")} />
      )}
    </>
  );
}

export function SettingsPage() {
  const user = useCurrentUser();
  const { t } = useI18n();
  useTitle(t("settings.title"));

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("settings.profile")} />
          <div className="space-y-5 p-5">
            <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-stone-500">{t("settings.email")}</dt>
                <dd className="mt-0.5 break-all text-stone-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-stone-500">{t("settings.role")}</dt>
                <dd className="mt-0.5 text-stone-900">{user.isAdmin ? t("users.role.admin") : t("users.role.member")}</dd>
              </div>
            </dl>
            <DisplayNameForm initialName={user.displayName} />
          </div>
        </Card>

        <Card>
          <CardHeader title={t("settings.language")} description={t("settings.languageHelp")} />
          <div className="p-5">
            <LanguageSwitcher />
          </div>
        </Card>

        <Card>
          <CardHeader title={t("settings.password")} />
          <div className="p-5">
            <PasswordForm email={user.email} />
          </div>
        </Card>
      </div>
    </>
  );
}
