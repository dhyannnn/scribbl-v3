-- CreateTable
CREATE TABLE "ChannelLastRead" (
    "channelId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelLastRead_pkey" PRIMARY KEY ("channelId","userId")
);

-- CreateIndex
CREATE INDEX "ChannelLastRead_userId_idx" ON "ChannelLastRead"("userId");

-- AddForeignKey
ALTER TABLE "ChannelLastRead" ADD CONSTRAINT "ChannelLastRead_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLastRead" ADD CONSTRAINT "ChannelLastRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
