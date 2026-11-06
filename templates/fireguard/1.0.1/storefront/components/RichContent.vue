<script lang="ts">
import { defineComponent, h } from 'vue';
import { renderRichNodes } from '#preview-shared/rich-content.mjs';
export default defineComponent({ name:'RichContent', props:{ nodes:{type:Array,required:true} }, setup(props) { return () => h('div',{class:'rich-content'},renderRichNodes(props.nodes,h) || []); } });
</script>
