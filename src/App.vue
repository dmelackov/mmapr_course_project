<script setup lang="ts">
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';

import FormulaTab from '@/components/FormulaTab.vue';
import TMOTab from './components/TMOTab.vue';
</script>

<template>
  <div class="w-screen h-screen bg-surface-50">
    <Tabs value="0"
      class="h-full">
      <TabList>
        <Tab value="0">Формулы</Tab>
        <Tab value="1">Теория массового обслуживания</Tab>
      </TabList>
      <TabPanels class="h-full">
        <TabPanel value="0"
          class="h-full">
          <FormulaTab></FormulaTab>
        </TabPanel>
        <TabPanel value="1"
          class="h-full">
          <TMOTab></TMOTab>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
