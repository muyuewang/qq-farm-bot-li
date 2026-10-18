<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MobileBottomNav from '@/components/MobileBottomNav.vue'
import PageHeader from '@/components/PageHeader.vue'
import Sidebar from '@/components/Sidebar.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const route = useRoute()
const { sidebarOpen, activityDetailOpen } = storeToRefs(appStore)
// 页头固定在滚动区之外；活动详情自带标题栏，打开时隐藏通用页头。
const activityDetail = computed(() => route.name === 'activity-center' && activityDetailOpen.value)
const showPageHeader = computed(() => !route.meta.fullBleed && !activityDetail.value)
// 顶部栏（页头 + 页面 Tab + 页面工具栏）静止时透明，内容开始滚动后统一换上毛玻璃底与底部细线。
const scrolled = ref(false)
const scrollEl = ref<HTMLElement | null>(null)

// 吸顶的面板工具栏紧贴在 Tab 下方，偏移量按 Tab 的实际高度测量，避免出现漏缝或重叠。
function measureStickyTop() {
  const el = scrollEl.value
  if (!el)
    return
  const tabs = el.querySelector<HTMLElement>('.page-tabs')
  el.style.setProperty('--sticky-top', `${tabs ? tabs.offsetHeight : 0}px`)
  // 页头右边缘与滚动区对齐：经典滚动条占位时让出它的宽度，悬浮滚动条（手机）为 0。
  el.parentElement?.style.setProperty('--scrollbar-w', `${Math.max(0, el.offsetWidth - el.clientWidth)}px`)
}

function onPageScroll(event: Event) {
  const next = (event.target as HTMLElement).scrollTop > 2
  if (next && !scrolled.value)
    measureStickyTop()
  scrolled.value = next
}

watch(() => route.fullPath, async () => {
  scrolled.value = false
  await nextTick()
  // 等待页面切换动画结束后再量一次。
  window.setTimeout(measureStickyTop, 220)
}, { immediate: true })
useEventListener(window, 'resize', measureStickyTop, { passive: true })
</script>

<template>
  <div class="liquid-layout w-screen flex overflow-hidden">
    <div
      v-if="sidebarOpen"
      class="navigation-overlay fixed inset-0 z-40 lg:hidden"
      @click="appStore.closeSidebar"
    />

    <Sidebar />

    <main class="app-main relative h-full min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
      <div class="app-content min-h-0 flex flex-1 flex-col overflow-hidden" :class="{ 'is-scrolled': scrolled }">
        <div v-if="showPageHeader" class="page-header-bar">
          <PageHeader />
        </div>
        <div
          ref="scrollEl"
          class="page-scroll custom-scrollbar flex flex-1 flex-col"
          :class="[
            route.meta.fullBleed ? 'overflow-hidden p-0' : 'overflow-y-auto',
            { 'page-scroll--under-header': showPageHeader, 'page-scroll--fill': activityDetail },
          ]"
          @scroll.passive="onPageScroll"
        >
          <RouterView v-slot="{ Component, route: currentRoute }">
            <Transition name="page-fade" mode="out-in">
              <component :is="Component" :key="currentRoute.path" />
            </Transition>
          </RouterView>
        </div>
      </div>
    </main>

    <MobileBottomNav v-if="!route.meta.fullBleed" />
  </div>
</template>

<style scoped>
.liquid-layout {
  height: 100dvh;
}

.navigation-overlay {
  background: rgba(30, 39, 32, 0.32);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

/* 页头与内容共用的左右留白，吸顶栏的底色据此铺满整行。 */
.app-content {
  --page-pad: clamp(16px, 2.4vw, 34px);
}

.page-header-bar {
  position: relative;
  z-index: 12;
  flex-shrink: 0;
  margin-right: var(--scrollbar-w, 0px);
  padding: 22px var(--page-pad) 0;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.page-header-bar > :deep(*) {
  width: 100%;
  max-width: 1580px;
  margin-inline: auto;
}

/* 没有页面 Tab 的页面，细线落在页头下沿；有 Tab 时由 Tab/工具栏画在整块顶部栏的最下沿。 */
.app-content.is-scrolled .page-header-bar {
  background: var(--chrome-bg);
  box-shadow: 0 1px 0 var(--ui-border);
  -webkit-backdrop-filter: var(--chrome-blur);
  backdrop-filter: var(--chrome-blur);
}

.app-content.is-scrolled:has(.page-tabs) .page-header-bar {
  box-shadow: none;
}

.page-scroll {
  min-height: 0;
  padding: 22px var(--page-pad) 28px;
}

.page-scroll--under-header {
  padding-top: 0;
}

.page-scroll > :deep(*) {
  flex: 0 0 auto;
  width: 100%;
  max-width: 1580px;
  margin-inline: auto;
}

/* 活动详情：外壳撑满内容区，活动自己的区域内部滚动，外层不再出现第二条滚动条。 */
.page-scroll--fill > :deep(*) {
  flex: 1 1 auto;
  min-height: 0;
}

.page-fade-enter-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.page-fade-leave-active {
  transition: opacity 0.1s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(3px);
}

.page-fade-leave-to {
  opacity: 0;
}

@media (max-width: 1023px) {
  .app-content {
    --page-pad: 12px;
  }

  .page-header-bar {
    padding-top: 12px;
  }

  .page-scroll {
    /* 底部导航是悬浮的，留出它的高度，最后一张卡片和按钮不会被挡住。 */
    padding: 14px var(--page-pad) calc(104px + env(safe-area-inset-bottom));
    scroll-padding-bottom: calc(104px + env(safe-area-inset-bottom));
  }

  .page-scroll--under-header {
    padding-top: 0;
  }
}

@media (max-width: 480px) {
  .app-content {
    --page-pad: 8px;
  }
}
</style>
