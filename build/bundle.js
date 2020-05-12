var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src/components/HowTo.svelte generated by Svelte v3.22.2 */

    function create_fragment(ctx) {
    	let div0;
    	let img0;
    	let img0_src_value;
    	let t0;
    	let img1;
    	let img1_src_value;
    	let t1;
    	let img2;
    	let img2_src_value;
    	let t2;
    	let img3;
    	let img3_src_value;
    	let t3;
    	let div1;
    	let img4;
    	let img4_src_value;
    	let t4;
    	let img5;
    	let img5_src_value;
    	let t5;
    	let img6;
    	let img6_src_value;
    	let t6;
    	let img7;
    	let img7_src_value;
    	let t7;
    	let div2;
    	let img8;
    	let img8_src_value;
    	let t8;
    	let img9;
    	let img9_src_value;
    	let t9;
    	let img10;
    	let img10_src_value;
    	let t10;
    	let img11;
    	let img11_src_value;

    	return {
    		c() {
    			div0 = element("div");
    			img0 = element("img");
    			t0 = space();
    			img1 = element("img");
    			t1 = space();
    			img2 = element("img");
    			t2 = space();
    			img3 = element("img");
    			t3 = space();
    			div1 = element("div");
    			img4 = element("img");
    			t4 = space();
    			img5 = element("img");
    			t5 = space();
    			img6 = element("img");
    			t6 = space();
    			img7 = element("img");
    			t7 = space();
    			div2 = element("div");
    			img8 = element("img");
    			t8 = space();
    			img9 = element("img");
    			t9 = space();
    			img10 = element("img");
    			t10 = space();
    			img11 = element("img");
    			attr(img0, "bp", "offset-5@md 1@md 3@sm");
    			if (img0.src !== (img0_src_value = "images/1.jpeg")) attr(img0, "src", img0_src_value);
    			attr(img0, "alt", "Wet hands with water");
    			attr(img0, "class", "svelte-14xkmhh");
    			toggle_class(img0, "next", /*active*/ ctx[0] == 1);
    			attr(img1, "bp", " 1@md 3@sm");
    			if (img1.src !== (img1_src_value = "images/2.jpeg")) attr(img1, "src", img1_src_value);
    			attr(img1, "alt", "Apply enough soap to cover all hand surfaces");
    			attr(img1, "class", "svelte-14xkmhh");
    			toggle_class(img1, "next", /*active*/ ctx[0] == 2);
    			attr(img2, "bp", " 1@md 3@sm");
    			if (img2.src !== (img2_src_value = "images/3.jpeg")) attr(img2, "src", img2_src_value);
    			attr(img2, "alt", "Rub hands palm\n  to palm");
    			attr(img2, "class", "svelte-14xkmhh");
    			toggle_class(img2, "next", /*active*/ ctx[0] == 3);
    			attr(img3, "bp", " 1@md 3@sm");
    			if (img3.src !== (img3_src_value = "images/4.jpeg")) attr(img3, "src", img3_src_value);
    			attr(img3, "alt", "Right palm over left dorsum with interlaced fingers and vice versa");
    			attr(img3, "class", "svelte-14xkmhh");
    			toggle_class(img3, "next", /*active*/ ctx[0] == 4);
    			attr(div0, "bp", "grid");
    			attr(div0, "class", "c svelte-14xkmhh");
    			attr(img4, "bp", "offset-5@md 1@md 3@sm");
    			if (img4.src !== (img4_src_value = "images/5.jpeg")) attr(img4, "src", img4_src_value);
    			attr(img4, "alt", "palm to palm with fingers interlaced");
    			attr(img4, "class", "svelte-14xkmhh");
    			toggle_class(img4, "next", /*active*/ ctx[0] == 5);
    			attr(img5, "bp", "\n  1@md 3@sm");
    			if (img5.src !== (img5_src_value = "images/6.jpeg")) attr(img5, "src", img5_src_value);
    			attr(img5, "alt", "backs of fingers to opposing palms with\n  fingers interlocked");
    			attr(img5, "class", "svelte-14xkmhh");
    			toggle_class(img5, "next", /*active*/ ctx[0] == 6);
    			attr(img6, "bp", " 1@md 3@sm");
    			if (img6.src !== (img6_src_value = "images/7.jpeg")) attr(img6, "src", img6_src_value);
    			attr(img6, "alt", "rotational rubbing of left thumb clasped in right\n  palm and vice versa");
    			attr(img6, "class", "svelte-14xkmhh");
    			toggle_class(img6, "next", /*active*/ ctx[0] == 7);
    			attr(img7, "bp", " 1@md 3@sm");
    			if (img7.src !== (img7_src_value = "images/8.jpeg")) attr(img7, "src", img7_src_value);
    			attr(img7, "alt", "rotational rubbing, backwards and forwards with\n  clasped fingers of right hand in left palm and vice versa");
    			attr(img7, "class", "svelte-14xkmhh");
    			toggle_class(img7, "next", /*active*/ ctx[0] == 8);
    			attr(div1, "bp", "grid");
    			attr(div1, "class", "c svelte-14xkmhh");
    			attr(img8, "bp", "offset-5@md 1@md 3@sm");
    			if (img8.src !== (img8_src_value = "images/9.jpeg")) attr(img8, "src", img8_src_value);
    			attr(img8, "alt", "Rinse hands with water");
    			attr(img8, "class", "svelte-14xkmhh");
    			toggle_class(img8, "next", /*active*/ ctx[0] == 9);
    			attr(img9, "bp", " 1@md 3@sm");
    			if (img9.src !== (img9_src_value = "images/10.jpeg")) attr(img9, "src", img9_src_value);
    			attr(img9, "alt", "dry thoroughly with a single use towel");
    			attr(img9, "class", "svelte-14xkmhh");
    			toggle_class(img9, "next", /*active*/ ctx[0] == 10);
    			attr(img10, "bp", " 1@md 3@sm");
    			if (img10.src !== (img10_src_value = "images/11.jpeg")) attr(img10, "src", img10_src_value);
    			attr(img10, "alt", "use towel to\n  turn of faucet");
    			attr(img10, "class", "svelte-14xkmhh");
    			toggle_class(img10, "next", /*active*/ ctx[0] == 11);
    			attr(img11, "bp", " 1@md 3@sm");
    			if (img11.src !== (img11_src_value = "images/12.jpeg")) attr(img11, "src", img11_src_value);
    			attr(img11, "alt", "...and your hans are safe");
    			attr(img11, "class", "svelte-14xkmhh");
    			toggle_class(img11, "next", /*active*/ ctx[0] == 12);
    			attr(div2, "bp", "grid");
    			attr(div2, "class", "c svelte-14xkmhh");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);
    			append(div0, img0);
    			append(div0, t0);
    			append(div0, img1);
    			append(div0, t1);
    			append(div0, img2);
    			append(div0, t2);
    			append(div0, img3);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			append(div1, img4);
    			append(div1, t4);
    			append(div1, img5);
    			append(div1, t5);
    			append(div1, img6);
    			append(div1, t6);
    			append(div1, img7);
    			insert(target, t7, anchor);
    			insert(target, div2, anchor);
    			append(div2, img8);
    			append(div2, t8);
    			append(div2, img9);
    			append(div2, t9);
    			append(div2, img10);
    			append(div2, t10);
    			append(div2, img11);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*active*/ 1) {
    				toggle_class(img0, "next", /*active*/ ctx[0] == 1);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img1, "next", /*active*/ ctx[0] == 2);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img2, "next", /*active*/ ctx[0] == 3);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img3, "next", /*active*/ ctx[0] == 4);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img4, "next", /*active*/ ctx[0] == 5);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img5, "next", /*active*/ ctx[0] == 6);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img6, "next", /*active*/ ctx[0] == 7);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img7, "next", /*active*/ ctx[0] == 8);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img8, "next", /*active*/ ctx[0] == 9);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img9, "next", /*active*/ ctx[0] == 10);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img10, "next", /*active*/ ctx[0] == 11);
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(img11, "next", /*active*/ ctx[0] == 12);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			if (detaching) detach(t7);
    			if (detaching) detach(div2);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { active = 0 } = $$props;

    	$$self.$set = $$props => {
    		if ("active" in $$props) $$invalidate(0, active = $$props.active);
    	};

    	return [active];
    }

    class HowTo extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { active: 0 });
    	}
    }

    /* src/components/ProgressBar.svelte generated by Svelte v3.22.2 */

    function create_fragment$1(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let span;
    	let t0;
    	let t1;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			span = element("span");
    			t0 = text(/*progress*/ ctx[0]);
    			t1 = text("%");
    			attr(span, "class", "sr-only");
    			attr(div0, "class", "progress-bar svelte-14p77ps");
    			set_style(div0, "width", /*progress*/ ctx[0] + "%");
    			attr(div1, "bp", "offset-5@md 4@md 12@sm");
    			attr(div1, "class", "progress-container svelte-14p77ps");
    			attr(div2, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    			append(div0, span);
    			append(span, t0);
    			append(span, t1);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*progress*/ 1) set_data(t0, /*progress*/ ctx[0]);

    			if (dirty & /*progress*/ 1) {
    				set_style(div0, "width", /*progress*/ ctx[0] + "%");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { progress = 0 } = $$props;

    	$$self.$set = $$props => {
    		if ("progress" in $$props) $$invalidate(0, progress = $$props.progress);
    	};

    	return [progress];
    }

    class ProgressBar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { progress: 0 });
    	}
    }

    /* src/components/Timer.svelte generated by Svelte v3.22.2 */

    function create_fragment$2(ctx) {
    	let div0;
    	let h2;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let div1;
    	let button;
    	let t4;
    	let current;
    	let dispose;
    	const progressbar = new ProgressBar({ props: { progress: /*progress*/ ctx[2] } });

    	return {
    		c() {
    			div0 = element("div");
    			h2 = element("h2");
    			t0 = text("Seconds Left: ");
    			t1 = text(/*secondLeft*/ ctx[0]);
    			t2 = space();
    			create_component(progressbar.$$.fragment);
    			t3 = space();
    			div1 = element("div");
    			button = element("button");
    			t4 = text("Start");
    			attr(h2, "bp", "offset-5@md 4@md 12@sm");
    			attr(h2, "class", "svelte-14r8ovt");
    			attr(div0, "bp", "grid");
    			attr(button, "bp", "offset-5@md 4@md 12@sm");
    			attr(button, "class", "start svelte-14r8ovt");
    			button.disabled = /*isRunning*/ ctx[1];
    			attr(div1, "bp", "grid");
    		},
    		m(target, anchor, remount) {
    			insert(target, div0, anchor);
    			append(div0, h2);
    			append(h2, t0);
    			append(h2, t1);
    			insert(target, t2, anchor);
    			mount_component(progressbar, target, anchor);
    			insert(target, t3, anchor);
    			insert(target, div1, anchor);
    			append(div1, button);
    			append(button, t4);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(button, "click", /*startTimer*/ ctx[3]);
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*secondLeft*/ 1) set_data(t1, /*secondLeft*/ ctx[0]);
    			const progressbar_changes = {};
    			if (dirty & /*progress*/ 4) progressbar_changes.progress = /*progress*/ ctx[2];
    			progressbar.$set(progressbar_changes);

    			if (!current || dirty & /*isRunning*/ 2) {
    				button.disabled = /*isRunning*/ ctx[1];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(progressbar.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(progressbar.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t2);
    			destroy_component(progressbar, detaching);
    			if (detaching) detach(t3);
    			if (detaching) detach(div1);
    			dispose();
    		}
    	};
    }

    const totalSeconds = 20;
    const totalStages = 12;

    function instance$2($$self, $$props, $$invalidate) {
    	const dispatchFinishedEvent = createEventDispatcher();
    	const dispatchNextStageEvent = createEventDispatcher();
    	const stageLength = (totalSeconds / totalStages - totalSeconds / totalStages / 1000) * 1000;
    	let secondLeft = totalSeconds;
    	let isRunning = false;
    	let stageLengthCompleted = 0;

    	function startTimer() {
    		function countDown() {
    			$$invalidate(0, secondLeft -= 1);

    			if (secondLeft == 0) {
    				clearInterval(interval);
    				$$invalidate(1, isRunning = false);
    				$$invalidate(0, secondLeft = totalSeconds);
    				dispatchFinishedEvent("finished", { text: "Timer Completed", length: 0 });
    			}
    		}

    		function updateStage() {
    			dispatchNextStageEvent("nextStage", { length: stageLength });
    			stageLengthCompleted += stageLength;

    			if (Math.ceil(stageLengthCompleted / 1000) == 20) {
    				clearInterval(updateStages);
    				stageLengthCompleted = 0;
    			}
    		}

    		$$invalidate(1, isRunning = true);
    		const interval = setInterval(countDown, 1000);
    		const updateStages = setInterval(updateStage, stageLength);
    	}

    	let progress;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*secondLeft*/ 1) {
    			 $$invalidate(2, progress = (totalSeconds - secondLeft) * 5);
    		}
    	};

    	return [secondLeft, isRunning, progress, startTimer];
    }

    class Timer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src/App.svelte generated by Svelte v3.22.2 */

    function create_fragment$3(ctx) {
    	let h1;
    	let t1;
    	let t2;
    	let t3;
    	let h3;
    	let t7;
    	let audio_1;
    	let current;
    	const timer = new Timer({});
    	timer.$on("finished", /*timerEnds*/ ctx[2]);
    	timer.$on("nextStage", /*showNextStage*/ ctx[3]);
    	const howto = new HowTo({ props: { active: /*active*/ ctx[1] } });

    	return {
    		c() {
    			h1 = element("h1");
    			h1.textContent = "Handwashing App";
    			t1 = space();
    			create_component(timer.$$.fragment);
    			t2 = space();
    			create_component(howto.$$.fragment);
    			t3 = space();
    			h3 = element("h3");

    			h3.innerHTML = `<a href="https://www.who.int/gpsc/clean_hands_protection/en/" class="svelte-1i75f42">Picture source</a> 
  <a href="https://freesound.org/people/metrostock99/sounds/345086/" class="svelte-1i75f42">Sound source</a>`;

    			t7 = space();
    			audio_1 = element("audio");
    			audio_1.innerHTML = `<source src="build/sound.wav">`;
    			attr(h1, "class", "svelte-1i75f42");
    			attr(h3, "class", "svelte-1i75f42");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			insert(target, t1, anchor);
    			mount_component(timer, target, anchor);
    			insert(target, t2, anchor);
    			mount_component(howto, target, anchor);
    			insert(target, t3, anchor);
    			insert(target, h3, anchor);
    			insert(target, t7, anchor);
    			insert(target, audio_1, anchor);
    			/*audio_1_binding*/ ctx[5](audio_1);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const howto_changes = {};
    			if (dirty & /*active*/ 2) howto_changes.active = /*active*/ ctx[1];
    			howto.$set(howto_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(timer.$$.fragment, local);
    			transition_in(howto.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(timer.$$.fragment, local);
    			transition_out(howto.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if (detaching) detach(t1);
    			destroy_component(timer, detaching);
    			if (detaching) detach(t2);
    			destroy_component(howto, detaching);
    			if (detaching) detach(t3);
    			if (detaching) detach(h3);
    			if (detaching) detach(t7);
    			if (detaching) detach(audio_1);
    			/*audio_1_binding*/ ctx[5](null);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let audio;
    	let stages = [];
    	let active = 0;

    	function timerEnds() {
    		audio.play();
    		$$invalidate(1, active = 0);
    	}

    	function showNextStage(e) {
    		stages.push(e.detail.length);
    		$$invalidate(1, active = stages.length);
    	}

    	function audio_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, audio = $$value);
    		});
    	}

    	return [audio, active, timerEnds, showNextStage, stages, audio_1_binding];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
