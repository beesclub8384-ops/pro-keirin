import { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "선수 - 7randoms",
};

export default function PlayersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      <div className="mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          선수
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          경륜 선수 정보를 확인하세요
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20">
          <p className="text-lg font-medium text-muted-foreground">
            준비 중입니다
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            선수 정보 페이지를 준비하고 있습니다. 조금만 기다려 주세요.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
